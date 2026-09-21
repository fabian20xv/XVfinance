import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SignJWT } from 'jose';
import { listToolNames, openaiToolsFromAllowlist, TOOL_ALLOWLIST } from '../src/ai/tools/index.js';
import { listToolNames as routerListToolNames, TOOL_ALLOWLIST as ROUTER_ALLOWLIST } from '../src/chat/tool-router.js';
import {
  agentMayConfirm,
  CHAT_EVENT_TYPES,
  createOpenAIProvider,
  extractProposalPayload,
  formatSse,
  ModelUnavailableError,
  resolveOpenAIApiKey,
  runChatTurn,
} from '../src/ai/runtime/index.js';
import { buildSystemPrompt, CONFIRM_ON_WRITE_RULES, PM_SYSTEM_PROMPT, TOP_10_IM_JOBS } from '../src/ai/prompts/index.js';
import { TESS_TOP_10_JOBS } from '../src/db/tess-ids.js';
import { consumeSseBuffer, parseSseBlock } from '../src/web/chat-stream.js';
import { ALLOWED_JWT_ISSUER, ALLOWED_SUPABASE_URL } from '../src/config/supabase-lock.js';
import { SMOKE_FIRM_ID, SMOKE_MANAGER_ID, SMOKE_PROPOSAL_ID } from '../src/db/smoke-ids.js';
import { createFetchHandler } from '../src/server/fetch-adapter.js';
import { startApiServer } from '../src/server/http.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'xvfinance-test-jwt-secret-32chars!';
const session = {
  userId: SMOKE_MANAGER_ID,
  firmId: SMOKE_FIRM_ID,
  role: 'manager',
};

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

async function mint() {
  return new SignJWT({ role: 'authenticated', aud: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ALLOWED_JWT_ISSUER)
    .setSubject(SMOKE_MANAGER_ID)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(SECRET));
}

async function withServer(t, { env = {}, deps = {} } = {}, fn) {
  const server = await startApiServer({
    port: 0,
    env: {
      SUPABASE_URL: ALLOWED_SUPABASE_URL,
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_JWT_SECRET: SECRET,
      ...env,
    },
    deps: {
      attachSession: async ({ userId }) => ({
        userId,
        firmId: SMOKE_FIRM_ID,
        role: 'manager',
      }),
      ...deps,
    },
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  return fn(port);
}

describe('E11 agent chat runtime', () => {
  it('ships prompts / runtime / tools layout', () => {
    for (const rel of [
      'src/ai/prompts/index.js',
      'src/ai/prompts/pm.js',
      'src/ai/prompts/confirm-on-write.js',
      'src/ai/prompts/im-jobs.js',
      'src/ai/runtime/index.js',
      'src/ai/runtime/turn.js',
      'src/ai/runtime/openai.js',
      'src/ai/runtime/events.js',
      'src/ai/runtime/timeouts.js',
      'src/ai/tools/index.js',
      'src/ai/tools/adapters.js',
    ]) {
      assert.ok(existsSync(join(root, rel)), rel);
    }
  });

  it('reuses the E2 tool-router allowlist — no second list', () => {
    assert.equal(TOOL_ALLOWLIST, ROUTER_ALLOWLIST);
    assert.deepEqual(listToolNames(), routerListToolNames());
    const openaiNames = openaiToolsFromAllowlist().map((row) => row.function.name).sort();
    assert.deepEqual(openaiNames, routerListToolNames());
    const adapters = read('src/ai/tools/adapters.js');
    assert.match(adapters, /TOOL_ALLOWLIST/);
    assert.equal(adapters.includes('SECOND_ALLOWLIST'), false);
    assert.match(adapters, /from '\.\.\/\.\.\/chat\/tool-router\.js'/);
  });

  it('PM prompt includes confirm-on-write and Tess top-10 IM jobs', () => {
    const prompt = buildSystemPrompt();
    assert.match(prompt, /Confirm-on-write/);
    assert.match(CONFIRM_ON_WRITE_RULES, /same proposal_id/);
    assert.match(CONFIRM_ON_WRITE_RULES, /Confirm change/);
    assert.match(PM_SYSTEM_PROMPT, /service-role/);
    assert.equal(TOP_10_IM_JOBS, TESS_TOP_10_JOBS);
    assert.equal(TESS_TOP_10_JOBS.length, 10);
    for (const job of TESS_TOP_10_JOBS) {
      assert.match(prompt, new RegExp(job.job.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  it('src/ai never imports src/server or service-role APIs', () => {
    const files = [
      'src/ai/prompts/index.js',
      'src/ai/prompts/pm.js',
      'src/ai/prompts/confirm-on-write.js',
      'src/ai/prompts/im-jobs.js',
      'src/ai/runtime/index.js',
      'src/ai/runtime/turn.js',
      'src/ai/runtime/openai.js',
      'src/ai/runtime/events.js',
      'src/ai/runtime/timeouts.js',
      'src/ai/tools/index.js',
      'src/ai/tools/adapters.js',
    ];
    for (const rel of files) {
      const source = read(rel);
      assert.equal(/from ['"][^'"]*server\//.test(source), false, rel);
      assert.equal(source.includes('createServiceRoleClient'), false, rel);
      assert.equal(source.includes('getServiceRoleKey'), false, rel);
      assert.equal(source.includes('SUPABASE_SERVICE_ROLE_KEY'), false, rel);
    }
  });

  it('extracts dual-confirm proposal payloads', () => {
    const payload = extractProposalPayload({
      id: SMOKE_PROPOSAL_ID,
      status: 'pending',
      confirm_card: {
        ui: 'chat.confirm_card',
        proposal_id: SMOKE_PROPOSAL_ID,
        status: 'pending',
      },
      workspace_panel: {
        ui: 'workspace.diff_confirm_panel',
        proposal_id: SMOKE_PROPOSAL_ID,
        status: 'pending',
      },
    });
    assert.equal(payload.proposal_id, SMOKE_PROPOSAL_ID);
    assert.equal(payload.confirm_card.ui, 'chat.confirm_card');
    assert.equal(payload.workspace_panel.ui, 'workspace.diff_confirm_panel');
    assert.equal(extractProposalPayload({ hello: true }), null);
  });

  it('blocks agent auto-confirm unless the user explicitly confirms', () => {
    assert.equal(agentMayConfirm('propose_holding_changes', 'sell AAPL'), true);
    assert.equal(agentMayConfirm('confirm_proposal', 'looks good'), false);
    assert.equal(agentMayConfirm('confirm_proposal', 'please confirm this proposal'), true);
    assert.equal(agentMayConfirm('reject_proposal', 'dismiss the proposal'), true);
  });

  it('short-circuits slash/JSON composer input through the same allowlist', async () => {
    const names = [];
    const turn = await runChatTurn({
      message: '/get_session',
      session,
      userJwt: 'user-jwt',
      dispatch: async ({ name, userJwt }) => {
        names.push(name);
        assert.equal(userJwt, 'user-jwt');
        return { ok: true, data: { user_id: session.userId, role: 'manager' } };
      },
    });
    assert.equal(turn.ok, true);
    assert.deepEqual(names, ['get_session']);
    assert.equal(turn.finish_reason, 'tool');
    assert.equal(turn.tool_calls[0].origin, 'composer');
    assert.ok(turn.events.some((event) => event.type === 'tool_call'));
    assert.ok(turn.events.some((event) => event.type === 'done'));
  });

  it('emits proposal events for pending writes and does not auto-confirm', async () => {
    const turn = await runChatTurn({
      message: '/propose_holding_changes {"portfolio_id":"p1","changes":[]}',
      session,
      userJwt: 'user-jwt',
      dispatch: async ({ name }) => {
        assert.equal(name, 'propose_holding_changes');
        return {
          ok: true,
          data: {
            id: SMOKE_PROPOSAL_ID,
            status: 'pending',
            confirm_card: {
              ui: 'chat.confirm_card',
              proposal_id: SMOKE_PROPOSAL_ID,
              status: 'pending',
            },
            workspace_panel: {
              ui: 'workspace.diff_confirm_panel',
              proposal_id: SMOKE_PROPOSAL_ID,
              status: 'pending',
            },
          },
        };
      },
    });
    assert.equal(turn.ok, true);
    assert.equal(turn.proposals[0].proposal_id, SMOKE_PROPOSAL_ID);
    assert.ok(turn.events.some((event) => event.type === 'proposal'));
    assert.equal(
      turn.events.find((event) => event.type === 'proposal').data.confirm_card.ui,
      'chat.confirm_card'
    );
  });

  it('OpenAI-primary loop calls allowlisted tools then answers', async () => {
    let round = 0;
    const dispatched = [];
    const provider = {
      async complete({ tools, messages }) {
        round += 1;
        assert.ok(tools.some((row) => row.function.name === 'list_clients'));
        assert.equal(tools.length, listToolNames().length);
        assert.equal(messages[0].role, 'system');
        assert.match(messages[0].content, /Confirm-on-write/);
        if (round === 1) {
          return {
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'list_clients', arguments: '{}' },
                },
              ],
            },
          };
        }
        return {
          finish_reason: 'stop',
          message: { role: 'assistant', content: 'Two clients on the book.' },
        };
      },
    };
    const turn = await runChatTurn({
      message: 'Who are my clients?',
      session,
      userJwt: 'user-jwt',
      provider,
      dispatch: async ({ name }) => {
        dispatched.push(name);
        return { ok: true, data: { items: [{ id: 'c1', label: 'Alpha' }] } };
      },
    });
    assert.equal(turn.ok, true);
    assert.deepEqual(dispatched, ['list_clients']);
    assert.equal(turn.message, 'Two clients on the book.');
    assert.ok(turn.events.some((event) => event.type === 'text_delta'));
    assert.equal(round, 2);
  });

  it('refuses unknown model tools via the router, not a second allowlist', async () => {
    let round = 0;
    const provider = {
      async complete() {
        round += 1;
        if (round === 1) {
          return {
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_x',
                  type: 'function',
                  function: { name: 'drop_production', arguments: '{}' },
                },
              ],
            },
          };
        }
        return {
          finish_reason: 'stop',
          message: { role: 'assistant', content: 'That tool is not on the allowlist.' },
        };
      },
    };
    const turn = await runChatTurn({
      message: 'delete everything',
      session,
      userJwt: 'user-jwt',
      provider,
      dispatch: async ({ name }) => ({
        ok: false,
        error: { code: 'unknown_tool', message: `Unknown or disallowed chat tool: ${name}` },
      }),
    });
    assert.equal(turn.tool_calls[0].ok, false);
    assert.equal(turn.tool_calls[0].error.code, 'unknown_tool');
  });

  it('blocks confirm_proposal from the model without an explicit user confirm', async () => {
    const dispatched = [];
    let round = 0;
    const provider = {
      async complete() {
        round += 1;
        if (round === 1) {
          return {
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_c',
                  type: 'function',
                  function: {
                    name: 'confirm_proposal',
                    arguments: JSON.stringify({ proposal_id: SMOKE_PROPOSAL_ID }),
                  },
                },
              ],
            },
          };
        }
        return {
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: 'Pending on ConfirmCard / DiffConfirmPanel (same proposal_id).',
          },
        };
      },
    };
    const turn = await runChatTurn({
      message: 'open a holding change',
      session,
      userJwt: 'user-jwt',
      provider,
      dispatch: async ({ name }) => {
        dispatched.push(name);
        return { ok: true, data: { status: 'confirmed' } };
      },
    });
    assert.deepEqual(dispatched, []);
    assert.equal(turn.tool_calls[0].error.code, 'confirm_required');
  });

  it('degrades without OPENAI_API_KEY and still documents streaming events', () => {
    assert.equal(resolveOpenAIApiKey({ OPENAI_API_KEY: 'replace-with-openai-api-key' }), null);
    const provider = createOpenAIProvider({ env: { OPENAI_API_KEY: '' } });
    assert.equal(provider.available, false);
    assert.ok(CHAT_EVENT_TYPES.includes('text_delta'));
    assert.match(formatSse('done', { ok: true }), /^event: done\n/);
    const event = parseSseBlock('event: tool_call\ndata: {"name":"list_clients"}');
    assert.equal(event.type, 'tool_call');
    assert.equal(event.data.name, 'list_clients');
    const seen = [];
    const leftover = consumeSseBuffer('event: done\ndata: {"ok":true}\n\n', (row) => seen.push(row));
    assert.equal(leftover, '');
    assert.equal(seen[0].data.ok, true);
  });

  it('natural-language turns fail closed when the model is unavailable', async () => {
    const turn = await runChatTurn({
      message: 'summarize this portfolio',
      session,
      userJwt: 'user-jwt',
      provider: {
        async complete() {
          throw new ModelUnavailableError('OPENAI_API_KEY is not set. Natural-language agent turns are unavailable; slash/JSON tools still work via the E2 allowlist.');
        },
      },
    });
    assert.equal(turn.ok, false);
    assert.equal(turn.error.code, 'model_unavailable');
  });

  it('POST /v1/chat JSON slash tool uses the same dispatch as /v1/tools', async (t) => {
    const token = await mint();
    const names = [];
    await withServer(
      t,
      {
        deps: {
          dispatch: async ({ name, userJwt }) => {
            names.push(name);
            assert.equal(userJwt, token);
            return { ok: true, data: { user_id: SMOKE_MANAGER_ID, role: 'manager' } };
          },
        },
      },
      async (port) => {
        const res = await fetch(`http://127.0.0.1:${port}/v1/chat`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ message: '/get_session', stream: false }),
        });
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.equal(body.ok, true);
        assert.deepEqual(names, ['get_session']);
        assert.equal(body.data.finish_reason, 'tool');
        assert.ok(body.data.events.some((event) => event.type === 'tool_result'));
      }
    );
  });

  it('POST /v1/chat streams SSE events', async (t) => {
    const token = await mint();
    await withServer(
      t,
      {
        deps: {
          dispatch: async () => ({ ok: true, data: { items: [] } }),
        },
      },
      async (port) => {
        const res = await fetch(`http://127.0.0.1:${port}/v1/chat`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            accept: 'text/event-stream',
          },
          body: JSON.stringify({ message: '/list_clients', stream: true }),
        });
        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type'), /text\/event-stream/);
        const text = await res.text();
        assert.match(text, /event: started/);
        assert.match(text, /event: tool_call/);
        assert.match(text, /event: tool_result/);
        assert.match(text, /event: done/);
      }
    );
  });

  it('POST /v1/chat degrades natural language without OPENAI_API_KEY', async (t) => {
    const token = await mint();
    await withServer(t, {}, async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ message: 'hello', stream: false }),
      });
      const body = await res.json();
      assert.equal(res.status, 503);
      assert.equal(body.ok, false);
      assert.equal(body.error.code, 'model_unavailable');
    });
  });

  it('fetch adapter streams /v1/chat SSE', async () => {
    const token = await mint();
    const handler = createFetchHandler({
      env: {
        SUPABASE_URL: ALLOWED_SUPABASE_URL,
        SUPABASE_ANON_KEY: 'anon-key',
        SUPABASE_JWT_SECRET: SECRET,
      },
      deps: {
        attachSession: async ({ userId }) => ({
          userId,
          firmId: SMOKE_FIRM_ID,
          role: 'manager',
        }),
        dispatch: async () => ({ ok: true, data: { ok: true } }),
      },
    });
    const response = await handler(
      new Request('http://127.0.0.1/v1/chat', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'text/event-stream',
        },
        body: JSON.stringify({ message: '/health', stream: true }),
      })
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    const text = await response.text();
    assert.match(text, /event: done/);
  });

  it('Dana composer is wired to POST /v1/chat and keeps confirm/scratchpad/receipts', () => {
    const shell = read('components/shell/AppShell.tsx');
    assert.match(shell, /postChat/);
    assert.match(shell, /hideConfirmCard=\{scratchpad\.open\}/);
    assert.match(read('components/chat/Composer.tsx'), /\/v1\/chat/);
    assert.match(read('components/chat/ConfirmCard.tsx'), /chat\.confirm_card/);
    assert.match(read('components/workspace/DiffConfirmPanel.tsx'), /workspace\.diff_confirm_panel/);
    assert.match(read('components/scratchpad/DraftVeil.tsx'), /source-of-truth="false"/);
    assert.match(read('components/meeting/ReceiptFootnote.tsx'), /question/);
    assert.equal(read('components/meeting/ReceiptFootnote.tsx').includes('Citations'), false);
  });
});
