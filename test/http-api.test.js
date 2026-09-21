import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { ALLOWED_JWT_ISSUER, ALLOWED_SUPABASE_URL } from '../src/config/supabase-lock.js';
import { SMOKE_FIRM_ID, SMOKE_MANAGER_ID } from '../src/db/smoke-ids.js';
import { startApiServer } from '../src/server/http.js';
import { resetRemoteJwksCache } from '../src/server/jwt.js';

const SECRET = 'xvfinance-test-jwt-secret-32chars!';
const PARENT_URL = 'https://krcwpupbdizzjyydzaqp.supabase.co';
const PARENT_REF = 'krcwpupbdizzjyydzaqp';
const DEVELOP_URL = 'https://bkwhqfkosxnoffpsjcug.supabase.co';
const DEVELOP_REF = 'bkwhqfkosxnoffpsjcug';
const THIRD_URL = 'https://abcdefghijklmnopqrst.supabase.co';
const SMOKE_SECRET = 'test-smoke-secret';

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

function smoke(port, { secret } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (secret !== undefined) {
    headers['x-smoke-secret'] = secret;
  }
  return fetch(`http://127.0.0.1:${port}/api/smoke`, {
    method: 'POST',
    headers,
    body: '{}',
  });
}

function waitForListen(child, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (fn, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      child.off('exit', onExit);
      fn(value);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(reject, new Error(`timeout waiting for listen.\nstdout: ${stdout}\nstderr: ${stderr}`));
    }, timeoutMs);

    const onStdout = (chunk) => {
      stdout += chunk;
      const match = stdout.match(/listening on http:\/\/127\.0\.0\.1:(\d+)/i);
      if (match) {
        finish(resolve, Number(match[1]));
      }
    };
    const onStderr = (chunk) => {
      stderr += chunk;
    };
    const onExit = (code) => {
      finish(
        reject,
        new Error(`process exited ${code} before listen.\nstdout: ${stdout}\nstderr: ${stderr}`)
      );
    };

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.on('exit', onExit);
  });
}

async function withServeProcess(env, fn) {
  const child = spawn(process.execPath, ['src/index.js', '--serve'], {
    env: { ...process.env, PORT: '0', ...env },
    encoding: 'utf8',
  });
  try {
    const port = await waitForListen(child);
    await fn(port);
  } finally {
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('close', resolve)),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
}

describe('Tess health and smoke on the E0 HTTP API', () => {
  it('GET /api/health returns 200 with commit, env, and supabaseRef', async (t) => {
    await withServer(
      t,
      { env: { APP_ENV: 'staging', GIT_COMMIT: 'abc123def' } },
      async (port) => {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.deepEqual(body, {
          ok: true,
          commit: 'abc123def',
          env: 'staging',
          supabaseRef: PARENT_REF,
        });
      }
    );
  });

  it('GET /api/health prefers VERCEL_GIT_COMMIT_SHA and reports the develop ref', async (t) => {
    await withServer(
      t,
      {
        env: {
          SUPABASE_URL: DEVELOP_URL,
          APP_ENV: 'preview',
          VERCEL_GIT_COMMIT_SHA: 'vercelsha',
          GIT_COMMIT: 'ignored',
        },
      },
      async (port) => {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.commit, 'vercelsha');
        assert.equal(body.env, 'preview');
        assert.equal(body.supabaseRef, DEVELOP_REF);
      }
    );
  });

  it('allowlist accepts both refs and rejects a third at server boot', async (t) => {
    await withServer(t, { env: { SUPABASE_URL: PARENT_URL } }, async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      assert.equal((await res.json()).supabaseRef, PARENT_REF);
    });
    await withServer(
      t,
      { env: { SUPABASE_URL: DEVELOP_URL, APP_ENV: 'staging' } },
      async (port) => {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`);
        assert.equal((await res.json()).supabaseRef, DEVELOP_REF);
      }
    );
    await assert.rejects(async () => {
      await startApiServer({
        port: 0,
        env: { SUPABASE_URL: THIRD_URL },
      });
    }, /Refused Supabase project ref/);
  });

  it('POST /api/smoke rejects a missing or wrong secret', async (t) => {
    await withServer(
      t,
      { env: { SUPABASE_URL: DEVELOP_URL, APP_ENV: 'staging', SMOKE_SECRET } },
      async (port) => {
        const missing = await smoke(port);
        assert.equal(missing.status, 401);
        assert.equal((await missing.json()).ok, false);

        const wrong = await smoke(port, { secret: 'nope' });
        assert.equal(wrong.status, 401);
        const wrongBody = await wrong.json();
        assert.equal(wrongBody.ok, false);
        assert.match(wrongBody.error, /invalid smoke secret/);
        assert.equal(JSON.stringify(wrongBody).includes(SMOKE_SECRET), false);
      }
    );
  });

  it('POST /api/smoke is refused in production even with a valid secret', async (t) => {
    await withServer(
      t,
      { env: { APP_ENV: 'production', SMOKE_SECRET } },
      async (port) => {
        const res = await smoke(port, { secret: SMOKE_SECRET });
        assert.equal(res.status, 403);
        const body = await res.json();
        assert.equal(body.ok, false);
        assert.match(body.error, /disabled in production/);
      }
    );
  });

  it('POST /api/smoke is refused when VERCEL_ENV is production', async (t) => {
    await withServer(
      t,
      { env: { VERCEL_ENV: 'production', SMOKE_SECRET } },
      async (port) => {
        const res = await smoke(port, { secret: SMOKE_SECRET });
        assert.equal(res.status, 403);
      }
    );
  });

  it('POST /api/smoke runs boot and skips auth/db when fixtures are absent', async (t) => {
    await withServer(
      t,
      { env: { SUPABASE_URL: DEVELOP_URL, APP_ENV: 'staging', SMOKE_SECRET } },
      async (port) => {
        const res = await smoke(port, { secret: SMOKE_SECRET });
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.ok, true);
        assert.equal(body.supabaseRef, DEVELOP_REF);
        assert.equal(body.steps.length, 3);
        assert.equal(body.steps[0].name, 'boot');
        assert.equal(body.steps[0].ok, true);
        assert.equal(typeof body.steps[0].ms, 'number');
        assert.equal(body.steps[1].name, 'auth');
        assert.equal(body.steps[1].skipped, true);
        assert.match(body.steps[1].reason, /SMOKE_USER_JWT not set/);
        assert.equal(body.steps[2].name, 'db');
        assert.equal(body.steps[2].skipped, true);
        assert.match(body.steps[2].reason, /SMOKE_DB_TABLE not set/);
      }
    );
  });

  it('POST /api/smoke uses the user-JWT client for auth and RLS db read', async (t) => {
    const calls = [];
    const createUserClient = (jwt, env) => {
      calls.push({ jwt, hasServiceRole: 'SUPABASE_SERVICE_ROLE_KEY' in env });
      return {
        auth: {
          getUser: async () => ({ data: { user: { id: 'fixture-user' } }, error: null }),
        },
        from(table) {
          return {
            select(columns) {
              return {
                async limit(n) {
                  calls.push({ table, columns, limit: n });
                  return { data: [{ id: 1 }], error: null };
                },
              };
            },
          };
        },
      };
    };

    await withServer(
      t,
      {
        env: {
          SUPABASE_URL: DEVELOP_URL,
          APP_ENV: 'staging',
          SMOKE_SECRET,
          SMOKE_USER_JWT: 'fixture-user-jwt',
          SMOKE_DB_TABLE: 'smoke_fixture',
          SMOKE_DB_SELECT: 'id',
          SUPABASE_ANON_KEY: 'anon-key',
          SUPABASE_SERVICE_ROLE_KEY: 'must-not-leak',
        },
        deps: { createUserClient },
      },
      async (port) => {
        const res = await smoke(port, { secret: SMOKE_SECRET });
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.ok, true);
        assert.equal(body.steps[1].skipped, false);
        assert.equal(body.steps[1].authenticated, true);
        assert.equal(body.steps[2].skipped, false);
        assert.equal(body.steps[2].rows, 1);
        assert.equal(JSON.stringify(body).includes('must-not-leak'), false);
        assert.equal(JSON.stringify(body).includes('fixture-user-jwt'), false);
        assert.ok(calls.some((c) => c.jwt === 'fixture-user-jwt' && c.hasServiceRole === false));
        assert.ok(calls.some((c) => c.table === 'smoke_fixture' && c.columns === 'id' && c.limit === 1));
      }
    );
  });

  it('src/index.js without --serve boots the lock and does not listen', () => {
    const result = spawnSync(process.execPath, ['src/index.js'], {
      env: { ...process.env, SUPABASE_URL: PARENT_URL },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /locked Supabase project krcwpupbdizzjyydzaqp/);
    assert.doesNotMatch(result.stdout, /listening/i);
  });

  it('src/index.js --serve listens on the E0 API and serves GET /api/health', async () => {
    await withServeProcess(
      { SUPABASE_URL: PARENT_URL, APP_ENV: 'development', GIT_COMMIT: 'serve-sha' },
      async (port) => {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.ok, true);
        assert.equal(body.commit, 'serve-sha');
        assert.equal(body.supabaseRef, PARENT_REF);
      }
    );
  });
});

describe('CA-2 HTTP API', () => {
  it('GET /health does not require a JWT and names the locked project', async (t) => {
    await withServer(t, {}, async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.data.project_ref, 'krcwpupbdizzjyydzaqp');
    });
  });

  it('GET /v1/session fails loud without a token', async (t) => {
    await withServer(t, { deps: sessionDeps }, async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/v1/session`);
      const body = await res.json();
      assert.equal(res.status, 401);
      assert.equal(body.ok, false);
      assert.equal(body.error.code, 'unauthenticated');
    });
  });

  it('GET /v1/session accepts a develop ES256 access token via JWKS', async (t) => {
    const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
    const jwk = await exportJWK(publicKey);
    jwk.kid = 'develop-es256';
    jwk.alg = 'ES256';
    jwk.use = 'sig';
    const token = await new SignJWT({ role: 'authenticated', aud: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: jwk.kid, typ: 'JWT' })
      .setIssuer(`${DEVELOP_URL}/auth/v1`)
      .setSubject(SMOKE_MANAGER_ID)
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(privateKey);

    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = String(input?.url ?? input);
      if (url === `${DEVELOP_URL}/auth/v1/.well-known/jwks.json`) {
        return new Response(JSON.stringify({ keys: [jwk] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return previousFetch(input, init);
    };
    t.after(() => {
      globalThis.fetch = previousFetch;
      resetRemoteJwksCache();
    });

    await withServer(
      t,
      {
        env: {
          SUPABASE_URL: DEVELOP_URL,
          SUPABASE_JWT_SECRET: SECRET,
          SUPABASE_ANON_KEY: 'anon-key',
          APP_ENV: 'staging',
        },
        deps: {
          ...sessionDeps,
          writeAudit: async () => 'audit-es256-session',
          dispatch: async ({ name, session }) => {
            assert.equal(name, 'get_session');
            return {
              ok: true,
              data: { user_id: session.userId, firm_id: session.firmId, role: session.role },
              audit: { action: 'session.read', entityTable: 'firm_members' },
            };
          },
        },
      },
      async (port) => {
        const res = await fetch(`http://127.0.0.1:${port}/v1/session`, {
          headers: { authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        assert.equal(res.status, 200, JSON.stringify(body));
        assert.equal(body.ok, true);
        assert.equal(body.data.user_id, SMOKE_MANAGER_ID);
      }
    );
  });

  it('GET /v1/proposals/:id/confirm-card and workspace-panel share proposal_id', async (t) => {
    const token = await mint();
    const calls = [];
    await withServer(
      t,
      {
        deps: {
          ...sessionDeps,
          writeAudit: async () => 'audit-card',
          dispatch: async ({ name, args }) => {
            calls.push({ name, args });
            const proposal_id = args.proposal_id;
            if (name === 'get_proposal_confirm_card') {
              return {
                ok: true,
                data: {
                  ui: 'chat.confirm_card',
                  proposal_id,
                  actions: [{ action: 'confirm', path: `/v1/proposals/${proposal_id}/confirm` }],
                },
                audit: { action: 'proposal.confirm_card', entityTable: 'proposals', entityId: proposal_id },
              };
            }
            return {
              ok: true,
              data: {
                ui: 'workspace.diff_confirm_panel',
                proposal_id,
                actions: [{ action: 'confirm', path: `/v1/proposals/${proposal_id}/confirm` }],
              },
              audit: { action: 'proposal.workspace_panel', entityTable: 'proposals', entityId: proposal_id },
            };
          },
        },
      },
      async (port) => {
        const id = SMOKE_FIRM_ID;
        const card = await fetch(`http://127.0.0.1:${port}/v1/proposals/${id}/confirm-card`, {
          headers: { authorization: `Bearer ${token}` },
        });
        const panel = await fetch(`http://127.0.0.1:${port}/v1/proposals/${id}/workspace-panel`, {
          headers: { authorization: `Bearer ${token}` },
        });
        const cardBody = await card.json();
        const panelBody = await panel.json();
        assert.equal(card.status, 200);
        assert.equal(panel.status, 200);
        assert.equal(cardBody.data.ui, 'chat.confirm_card');
        assert.equal(panelBody.data.ui, 'workspace.diff_confirm_panel');
        assert.equal(cardBody.data.proposal_id, id);
        assert.equal(panelBody.data.proposal_id, cardBody.data.proposal_id);
        assert.deepEqual(
          calls.map((c) => c.name),
          ['get_proposal_confirm_card', 'get_proposal_workspace_panel']
        );
      }
    );
  });

  it('POST /v1/tools health reports the runtime locked ref, not the parent constant', async (t) => {
    const token = await mint();
    await withServer(
      t,
      {
        env: { SUPABASE_URL: DEVELOP_URL, APP_ENV: 'staging' },
        deps: sessionDeps,
      },
      async (port) => {
        const res = await fetch(`http://127.0.0.1:${port}/v1/tools`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ name: 'health', args: {} }),
        });
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.equal(body.ok, true);
        assert.equal(body.data.project_ref, DEVELOP_REF);
        assert.equal(body.data.supabase_url, DEVELOP_URL);
        assert.notEqual(body.data.project_ref, PARENT_REF);
      }
    );
  });

  it('POST /v1/proposals/:id/confirm returns 200 when mutate succeeded but audit write fails', async (t) => {
    const token = await mint();
    await withServer(
      t,
      {
        deps: {
          ...sessionDeps,
          writeAudit: async () => {
            throw new Error('audit write failed: SUPABASE_SERVICE_ROLE_KEY is missing');
          },
          dispatch: async ({ name, args }) => {
            assert.equal(name, 'confirm_proposal');
            return {
              ok: true,
              data: { id: args.proposal_id, status: 'confirmed', db_status: 'applied' },
              audit: {
                action: 'proposal.applied',
                entityTable: 'proposals',
                entityId: args.proposal_id,
                sensitive: true,
              },
            };
          },
        },
      },
      async (port) => {
        const res = await fetch(`http://127.0.0.1:${port}/v1/proposals/${SMOKE_FIRM_ID}/confirm`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.equal(body.ok, true);
        assert.equal(body.data.db_status, 'applied');
        assert.equal(body.audit_id, undefined);
      }
    );
  });

  it('POST /v1/proposals/:id/reject returns 200 when mutate succeeded but audit write fails', async (t) => {
    const token = await mint();
    await withServer(
      t,
      {
        deps: {
          ...sessionDeps,
          writeAudit: async () => {
            throw new Error('audit write failed: missing id');
          },
          dispatch: async ({ name, args }) => {
            assert.equal(name, 'reject_proposal');
            return {
              ok: true,
              data: { id: args.proposal_id, status: 'rejected', db_status: 'rejected' },
              audit: {
                action: 'proposal.rejected',
                entityTable: 'proposals',
                entityId: args.proposal_id,
                sensitive: true,
              },
            };
          },
        },
      },
      async (port) => {
        const res = await fetch(`http://127.0.0.1:${port}/v1/proposals/${SMOKE_FIRM_ID}/reject`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.equal(body.ok, true);
        assert.equal(body.data.status, 'rejected');
      }
    );
  });

  it('POST /v1/proposals/:id/confirm dispatches confirm_proposal', async (t) => {
    const token = await mint();
    await withServer(
      t,
      {
        deps: {
          ...sessionDeps,
          writeAudit: async () => 'audit-confirm',
          dispatch: async ({ name, args, session }) => {
            assert.equal(name, 'confirm_proposal');
            assert.equal(args.proposal_id, SMOKE_FIRM_ID);
            assert.equal(session.role, 'manager');
            return {
              ok: true,
              data: { id: args.proposal_id, status: 'confirmed', db_status: 'applied' },
              audit: { action: 'proposal.applied', entityTable: 'proposals', entityId: args.proposal_id },
            };
          },
        },
      },
      async (port) => {
        const res = await fetch(`http://127.0.0.1:${port}/v1/proposals/${SMOKE_FIRM_ID}/confirm`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.equal(body.data.status, 'confirmed');
        assert.equal(body.audit_id, 'audit-confirm');
      }
    );
  });

  it('POST /v1/tools runs get_session with a user JWT and writes an audit id', async (t) => {
    const audits = [];
    const token = await mint();
    await withServer(
      t,
      {
        deps: {
          ...sessionDeps,
          writeAudit: async (event) => {
            audits.push(event);
            return 'audit-from-api';
          },
          dispatch: async ({ name, userJwt, session }) => {
            assert.equal(name, 'get_session');
            assert.equal(userJwt, token);
            assert.equal(session.role, 'manager');
            return {
              ok: true,
              data: { user_id: session.userId, firm_id: session.firmId, role: session.role },
              audit: { action: 'session.read', entityTable: 'firm_members' },
            };
          },
        },
      },
      async (port) => {
        const res = await fetch(`http://127.0.0.1:${port}/v1/tools`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ name: 'get_session', args: {} }),
        });
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.equal(body.ok, true);
        assert.equal(body.data.firm_id, SMOKE_FIRM_ID);
        assert.equal(body.data.role, 'manager');
        assert.equal(body.audit_id, 'audit-from-api');
        assert.equal(audits[0].firmId, SMOKE_FIRM_ID);
        assert.equal(audits[0].action, 'session.read');
      }
    );
  });

  it('POST /v1/tools market reads never audit a ticker as entityId', async (t) => {
    const audits = [];
    const token = await mint();
    await withServer(
      t,
      {
        deps: {
          ...sessionDeps,
          writeAudit: async (event) => {
            audits.push(event);
            return 'audit-market';
          },
        },
      },
      async (port) => {
        for (const name of ['get_quote', 'get_fundamentals', 'get_news_headlines']) {
          const res = await fetch(`http://127.0.0.1:${port}/v1/tools`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ name, args: { symbol: 'SPY' } }),
          });
          const body = await res.json();
          assert.equal(res.status, 200, `${name} ${body.error?.message ?? ''}`);
          assert.equal(body.ok, true);
        }
        assert.equal(audits.length, 3);
        for (const event of audits) {
          assert.notEqual(event.entityId, 'SPY');
          if (event.entityId != null) {
            assert.match(
              String(event.entityId),
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            );
          }
        }
      }
    );
  });

  it('POST /v1/imports/holdings maps unmatched_symbols to 409', async (t) => {
    const token = await mint();
    await withServer(
      t,
      {
        deps: {
          ...sessionDeps,
          dispatch: async ({ name }) => {
            assert.equal(name, 'import_holdings_csv');
            return {
              ok: false,
              error: { code: 'unmatched_symbols', message: 'Unmatched symbols block confirm: ZZZZ' },
            };
          },
        },
      },
      async (port) => {
        const res = await fetch(`http://127.0.0.1:${port}/v1/imports/holdings`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            portfolio_id: SMOKE_FIRM_ID,
            csv: 'symbol,quantity\nZZZZ,1\n',
          }),
        });
        const body = await res.json();
        assert.equal(res.status, 409);
        assert.equal(body.error.code, 'unmatched_symbols');
      }
    );
  });

  it('GET /v1/reports/:id/receipts dispatches get_meeting_receipts', async (t) => {
    const token = await mint();
    await withServer(
      t,
      {
        deps: {
          ...sessionDeps,
          writeAudit: async () => 'audit-receipts',
          dispatch: async ({ name, args }) => {
            assert.equal(name, 'get_meeting_receipts');
            return {
              ok: true,
              data: {
                ui: 'workspace.receipts_panel',
                report_id: args.report_id,
                public_url: null,
                receipts: [],
              },
              audit: { action: 'meeting.receipts', entityTable: 'reports', entityId: args.report_id },
            };
          },
        },
      },
      async (port) => {
        const res = await fetch(`http://127.0.0.1:${port}/v1/reports/${SMOKE_FIRM_ID}/receipts`, {
          headers: { authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.equal(body.data.ui, 'workspace.receipts_panel');
        assert.equal(body.data.public_url, null);
      }
    );
  });
});
