import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { SignJWT } from 'jose';
import { agentToolRegistry, openaiToolDefinitions } from '../src/ai/tools/adapter.js';
import { AGENT_CONFIRM_BLOCKED_TOOLS, CONFIRM_ON_WRITE_CODE } from '../src/ai/tools/confirm-policy.js';
import { executeAgentTool } from '../src/ai/tools/execute.js';
import { PM_JOBS } from '../src/ai/prompts/jobs.js';
import { buildSystemPrompt, CONFIRM_ON_WRITE_RULES } from '../src/ai/prompts/system.js';
import { ChatRuntimeError } from '../src/ai/runtime/errors.js';
import { resolveOpenAIApiKey } from '../src/ai/runtime/openai.js';
import { runChatTurn } from '../src/ai/runtime/turn.js';
import { listToolNames } from '../src/chat/tool-router.js';
import { ALLOWED_JWT_ISSUER, ALLOWED_SUPABASE_URL } from '../src/config/supabase-lock.js';
import { SMOKE_FIRM_ID, SMOKE_MANAGER_ID } from '../src/db/smoke-ids.js';
import { createFetchHandler } from '../src/server/fetch-adapter.js';
import { startApiServer } from '../src/server/http.js';
import { markServiceRoleClient } from '../src/security/service-role-guard.js';

const ROOT = join(import.meta.dirname, '..');
const SECRET = 'xvfinance-test-jwt-secret-32chars!';
const LOCKED_URL = ALLOWED_SUPABASE_URL;

const session = {
  userId: SMOKE_MANAGER_ID,
  firmId: SMOKE_FIRM_ID,
  role: 'manager',
};

function scriptedProvider(steps) {
  let i = 0;
  return {
    name: 'mock',
    model: 'mock-pm',
    async completeChat(input) {
      const step = steps[i++];
      if (!step) {
        throw new Error(`mock provider exhausted at call ${i}`);
      }
      if (typeof step === 'function') {
        return step(input);
      }
      return step;
    },
  };
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
      SUPABASE_URL: LOCKED_URL,
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_JWT_SECRET: SECRET,
      ...env,
    },
    deps,
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  return fn(port);
}

const sessionDeps = {
  attachSession: async ({ userId }) => ({
    userId,
    firmId: SMOKE_FIRM_ID,
    role: 'manager',
  }),
};

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else if (full.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

function parseSse(text) {
  const events = [];
  for (const block of String(text).split('\n\n')) {
    if (!block.trim()) {
      continue;
    }
    let event = 'message';
    const dataLines = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }
    if (dataLines.length) {
      events.push({ event, data: JSON.parse(dataLines.join('\n')) });
    }
  }
  return events;
}

describe('E11 agent tool adapters', () => {
  it('registry covers every E2 allowlisted tool name', () => {
    const names = listToolNames();
    const registry = agentToolRegistry();
    assert.deepEqual(Object.keys(registry).sort(), names);
    assert.ok(names.length > 20, 'expected the E3–E9 allowlist, not just health');
    for (const name of names) {
      assert.equal(registry[name].openai.type, 'function');
      assert.equal(registry[name].openai.function.name, name);
      assert.equal(registry[name].openai.function.parameters.type, 'object');
    }
  });

  it('omits confirm/reject from OpenAI tool definitions but keeps them in the registry', () => {
    const registry = agentToolRegistry();
    for (const name of AGENT_CONFIRM_BLOCKED_TOOLS) {
      assert.equal(registry[name].agentCallable, false);
    }
    const exposed = openaiToolDefinitions().map((tool) => tool.function.name);
    assert.equal(exposed.includes('confirm_proposal'), false);
    assert.equal(exposed.includes('reject_proposal'), false);
    assert.ok(exposed.includes('propose_holding_changes'));
    assert.ok(exposed.includes('get_session_context'));
    assert.ok(exposed.includes('ghostwrite_meeting_one_pager'));
    assert.ok(exposed.includes('get_scratchpad_impact'));
  });

  it('executeAgentTool refuses confirm_proposal without dispatching', async () => {
    const dispatched = [];
    const result = await executeAgentTool({
      name: 'confirm_proposal',
      args: { proposal_id: SMOKE_FIRM_ID },
      session,
      userJwt: 'user-jwt',
      env: { SUPABASE_URL: LOCKED_URL, SUPABASE_ANON_KEY: 'anon' },
      dispatch: async (params) => {
        dispatched.push(params.name);
        return { ok: true, data: { status: 'confirmed' } };
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, CONFIRM_ON_WRITE_CODE);
    assert.match(result.error.message, /ConfirmCard/);
    assert.deepEqual(dispatched, []);
  });
});

describe('E11 prompts', () => {
  it('ships ten PM jobs plus confirm-on-write and differentiators', () => {
    assert.equal(PM_JOBS.length, 10);
    const ids = PM_JOBS.map((job) => job.id);
    for (const id of [
      'stock_interest',
      'performance',
      'rebalance',
      'earnings',
      'meeting_prep',
      'watchlist',
      'concentration',
      'reporting',
      'relationship_memory',
      'cash_liquidity',
    ]) {
      assert.ok(ids.includes(id), id);
    }
    const prompt = buildSystemPrompt({ session });
    assert.match(prompt, /Impact Scratchpad/);
    assert.match(prompt, /Ghostwriter/);
    assert.match(prompt, /\[1\]/);
    assert.match(CONFIRM_ON_WRITE_RULES, /confirm_proposal/);
    assert.match(prompt, /NEVER call confirm_proposal/);
    for (const job of PM_JOBS) {
      assert.match(prompt, new RegExp(job.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });
});

describe('E11 runtime (mock provider, no live OpenAI)', () => {
  it('fails loud when OPENAI_API_KEY is missing or placeholder', async () => {
    assert.throws(() => resolveOpenAIApiKey({}), /OPENAI_API_KEY is missing/);
    assert.throws(
      () => resolveOpenAIApiKey({ OPENAI_API_KEY: 'replace-with-openai-api-key' }),
      /OPENAI_API_KEY is missing/
    );
    await assert.rejects(
      () =>
        runChatTurn({
          messages: [{ role: 'user', content: 'hi' }],
          session,
          userJwt: 'user-jwt',
          env: { SUPABASE_URL: LOCKED_URL, SUPABASE_ANON_KEY: 'anon' },
        }),
      (err) => err instanceof ChatRuntimeError && err.code === 'openai_api_key_missing' && err.status === 503
    );
  });

  it('does not pass service-role or OpenAI secrets into tool dispatch', async () => {
    let seenEnv;
    const provider = scriptedProvider([
      {
        content: '',
        toolCalls: [{ id: 'call_session', name: 'get_session', arguments: '{}' }],
        usage: { completion_tokens: 4 },
      },
      { content: 'You are a manager on Tess.', toolCalls: [], usage: { completion_tokens: 6 } },
    ]);
    const done = await runChatTurn({
      messages: [{ role: 'user', content: 'Who am I?' }],
      session,
      userJwt: 'user-jwt',
      env: {
        SUPABASE_URL: LOCKED_URL,
        SUPABASE_ANON_KEY: 'anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'must-not-leak',
        OPENAI_API_KEY: 'sk-should-not-reach-tools',
      },
      provider,
      dispatch: async ({ name, env, userJwt }) => {
        seenEnv = env;
        assert.equal(name, 'get_session');
        assert.equal(userJwt, 'user-jwt');
        assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined);
        assert.equal(env.OPENAI_API_KEY, undefined);
        return {
          ok: true,
          data: { user_id: session.userId, firm_id: session.firmId, role: session.role },
        };
      },
    });
    assert.equal(done.ok, true);
    assert.match(done.text, /manager/);
    assert.equal(seenEnv.SUPABASE_SERVICE_ROLE_KEY, undefined);
    assert.equal('OPENAI_API_KEY' in seenEnv, false);
  });

  it('does not use a marked service-role client when the router is in-process', async () => {
    const { dispatchTool } = await import('../src/chat/tool-router.js');
    await assert.rejects(
      () =>
        dispatchTool({
          name: 'get_session',
          args: {},
          session,
          userJwt: 'user-jwt',
          env: { SUPABASE_URL: LOCKED_URL, SUPABASE_ANON_KEY: 'anon' },
          createUserClient: () => markServiceRoleClient({ kind: 'admin' }),
        }),
      /cannot be used in chat tool context/
    );
  });

  it('keeps confirm-on-write: propose is allowed, confirm is not auto-applied', async () => {
    const dispatched = [];
    const card = {
      ui: 'chat.confirm_card',
      proposal_id: SMOKE_FIRM_ID,
      status: 'pending',
      requires_role: 'manager',
    };
    const panel = {
      ui: 'workspace.diff_confirm_panel',
      proposal_id: SMOKE_FIRM_ID,
      status: 'pending',
    };
    const provider = scriptedProvider([
      (input) => {
        const names = (input.tools ?? []).map((tool) => tool.function.name);
        assert.equal(names.includes('confirm_proposal'), false);
        return {
          content: '',
          toolCalls: [
            {
              id: 'call_propose',
              name: 'propose_holding_changes',
              arguments: JSON.stringify({ portfolio_id: SMOKE_FIRM_ID, changes: [{ op: 'upsert', symbol: 'NVDA', quantity: 1 }] }),
            },
          ],
          usage: { completion_tokens: 12 },
        };
      },
      {
        content: '',
        toolCalls: [
          {
            id: 'call_confirm',
            name: 'confirm_proposal',
            arguments: JSON.stringify({ proposal_id: SMOKE_FIRM_ID }),
          },
        ],
        usage: { completion_tokens: 4 },
      },
      {
        content: 'Opened a pending proposal. Click Confirm change — I cannot apply it.',
        toolCalls: [],
        usage: { completion_tokens: 10 },
      },
    ]);

    const done = await runChatTurn({
      messages: [{ role: 'user', content: 'Buy NVDA and just apply it.' }],
      session,
      userJwt: 'user-jwt',
      env: { SUPABASE_URL: LOCKED_URL, SUPABASE_ANON_KEY: 'anon' },
      provider,
      dispatch: async ({ name }) => {
        dispatched.push(name);
        if (name === 'propose_holding_changes') {
          return { ok: true, data: { confirm_card: card, workspace_panel: panel, status: 'pending' } };
        }
        return { ok: true, data: { status: 'confirmed', db_status: 'applied' } };
      },
    });

    assert.deepEqual(dispatched, ['propose_holding_changes']);
    assert.equal(done.confirm_card.proposal_id, SMOKE_FIRM_ID);
    assert.equal(done.workspace_panel.proposal_id, SMOKE_FIRM_ID);
    assert.match(done.text, /Confirm change/);
    assert.equal(done.tools.some((row) => row.name === 'confirm_proposal' && row.ok === false), true);
  });

  it('runs a basic read tool then streams/accumulates the assistant reply', async () => {
    const events = [];
    const provider = scriptedProvider([
      {
        content: '',
        toolCalls: [{ id: 't1', name: 'get_session_context', arguments: '{}' }],
        usage: { completion_tokens: 3 },
      },
      { content: 'Focus is unset.', toolCalls: [], usage: { completion_tokens: 5 } },
    ]);
    const done = await runChatTurn({
      messages: [{ role: 'user', content: 'What is my focus?' }],
      session,
      userJwt: 'user-jwt',
      env: { SUPABASE_URL: LOCKED_URL, SUPABASE_ANON_KEY: 'anon' },
      provider,
      emit: (event) => events.push(event),
      dispatch: async ({ name, userJwt }) => {
        assert.equal(name, 'get_session_context');
        assert.equal(userJwt, 'user-jwt');
        return { ok: true, data: { focus: { client_id: null, portfolio_id: null } } };
      },
    });
    assert.equal(done.ok, true);
    assert.equal(done.text, 'Focus is unset.');
    assert.ok(events.some((event) => event.event === 'tool' && event.data.status === 'running'));
    assert.ok(events.some((event) => event.event === 'delta'));
    assert.equal(events.at(-1).event, 'done');
  });
});

describe('E11 src/ai isolation', () => {
  it('layout exists and never imports src/server', () => {
    const required = [
      'src/ai/prompts/jobs.js',
      'src/ai/prompts/system.js',
      'src/ai/runtime/turn.js',
      'src/ai/runtime/openai.js',
      'src/ai/runtime/errors.js',
      'src/ai/runtime/limits.js',
      'src/ai/tools/adapter.js',
      'src/ai/tools/execute.js',
      'src/ai/tools/confirm-policy.js',
    ];
    for (const rel of required) {
      assert.ok(existsSync(join(ROOT, rel)), rel);
    }
    const files = walk(join(ROOT, 'src/ai'));
    const violations = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      if (/(from|import)\s+['"][^'"]*\/server\//.test(source) || source.includes('src/server/')) {
        violations.push(`${relative(ROOT, file)} imports server`);
      }
      if (source.includes('SUPABASE_SERVICE_ROLE_KEY')) {
        violations.push(`${relative(ROOT, file)} mentions service-role key`);
      }
    }
    assert.deepEqual(violations, []);
  });
});

describe('E11 POST /v1/chat HTTP', () => {
  it('requires a bearer user JWT like /v1/tools', async (t) => {
    await withServer(t, {}, async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], stream: false }),
      });
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.equal(body.ok, false);
      assert.equal(body.error.code, 'unauthenticated');
    });
  });

  it('returns a clear 503 when OPENAI_API_KEY is missing (no fake success)', async (t) => {
    const token = await mint();
    await withServer(t, { deps: sessionDeps }, async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], stream: false }),
      });
      const body = await res.json();
      assert.equal(res.status, 503);
      assert.equal(body.ok, false);
      assert.equal(body.error.code, 'openai_api_key_missing');
      assert.match(body.error.message, /OPENAI_API_KEY/);
      assert.equal(body.data?.text, undefined);
    });
  });

  it('runs a mocked turn with the user JWT and does not confirm proposals', async (t) => {
    const token = await mint();
    const dispatched = [];
    await withServer(
      t,
      {
        deps: {
          ...sessionDeps,
          writeAudit: async () => 'audit-chat',
          chatProvider: scriptedProvider([
            {
              content: '',
              toolCalls: [{ id: 'c1', name: 'get_session', arguments: '{}' }],
              usage: { completion_tokens: 2 },
            },
            { content: 'Authenticated as manager.', toolCalls: [], usage: { completion_tokens: 4 } },
          ]),
          dispatch: async ({ name, userJwt, session: sess }) => {
            dispatched.push({ name, userJwt, role: sess.role });
            return {
              ok: true,
              data: { user_id: sess.userId, firm_id: sess.firmId, role: sess.role },
              audit: { action: 'session.read', entityTable: 'firm_members' },
            };
          },
        },
      },
      async (port) => {
        const res = await fetch(`http://127.0.0.1:${port}/v1/chat`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({
            stream: false,
            messages: [{ role: 'user', content: 'Who am I?' }],
          }),
        });
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.equal(body.ok, true);
        assert.match(body.data.text, /manager/);
        assert.equal(dispatched[0].name, 'get_session');
        assert.equal(dispatched[0].userJwt, token);
        assert.equal(dispatched[0].role, 'manager');
      }
    );
  });

  it('streams SSE events through the Node listener and fetch adapter', async (t) => {
    const token = await mint();
    const provider = scriptedProvider([
      { content: 'Hello from the PM agent.', toolCalls: [], usage: { completion_tokens: 6 } },
    ]);
    await withServer(
      t,
      { deps: { ...sessionDeps, chatProvider: provider } },
      async (port) => {
        const res = await fetch(`http://127.0.0.1:${port}/v1/chat`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            accept: 'text/event-stream',
          },
          body: JSON.stringify({
            stream: true,
            messages: [{ role: 'user', content: 'Hello' }],
          }),
        });
        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type') || '', /text\/event-stream/);
        const text = await res.text();
        const events = parseSse(text);
        assert.ok(events.some((event) => event.event === 'delta'));
        assert.equal(events.at(-1).event, 'done');
        assert.match(events.at(-1).data.text, /PM agent/);
      }
    );

    const handler = createFetchHandler({
      env: {
        SUPABASE_URL: LOCKED_URL,
        SUPABASE_ANON_KEY: 'anon-key',
        SUPABASE_JWT_SECRET: SECRET,
      },
      deps: {
        ...sessionDeps,
        chatProvider: scriptedProvider([
          { content: 'Adapter stream.', toolCalls: [], usage: { completion_tokens: 2 } },
        ]),
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
        body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'Hi' }] }),
      })
    );
    assert.equal(response.status, 200);
    const streamed = parseSse(await response.text());
    assert.equal(streamed.at(-1).event, 'done');
    assert.match(streamed.at(-1).data.text, /Adapter stream/);
  });
});
