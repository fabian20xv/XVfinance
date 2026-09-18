import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { startHttpServer } from '../src/http/server.js';

const PARENT_URL = 'https://krcwpupbdizzjyydzaqp.supabase.co';
const PARENT_REF = 'krcwpupbdizzjyydzaqp';
const DEVELOP_URL = 'https://bkwhqfkosxnoffpsjcug.supabase.co';
const DEVELOP_REF = 'bkwhqfkosxnoffpsjcug';
const SMOKE_SECRET = 'test-smoke-secret';

const servers = [];

async function listen(env, options = {}) {
  const started = await startHttpServer(
    { PORT: '0', ...env },
    options
  );
  servers.push(started.server);
  return started;
}

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    await new Promise((resolve) => server.close(resolve));
  }
});

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

describe('Tess health and smoke HTTP API', () => {
  it('GET /api/health returns 200 with commit, env, and supabaseRef', async () => {
    const { port } = await listen({
      SUPABASE_URL: PARENT_URL,
      APP_ENV: 'staging',
      GIT_COMMIT: 'abc123def',
    });

    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, {
      ok: true,
      commit: 'abc123def',
      env: 'staging',
      supabaseRef: PARENT_REF,
    });
  });

  it('GET /api/health prefers VERCEL_GIT_COMMIT_SHA and reports the develop ref', async () => {
    const { port } = await listen({
      SUPABASE_URL: DEVELOP_URL,
      APP_ENV: 'preview',
      VERCEL_GIT_COMMIT_SHA: 'vercelsha',
      GIT_COMMIT: 'ignored',
    });

    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.commit, 'vercelsha');
    assert.equal(body.env, 'preview');
    assert.equal(body.supabaseRef, DEVELOP_REF);
  });

  it('POST /api/smoke rejects a missing or wrong secret', async () => {
    const { port } = await listen({
      SUPABASE_URL: DEVELOP_URL,
      APP_ENV: 'staging',
      SMOKE_SECRET,
    });

    const missing = await smoke(port);
    assert.equal(missing.status, 401);
    assert.equal((await missing.json()).ok, false);

    const wrong = await smoke(port, { secret: 'nope' });
    assert.equal(wrong.status, 401);
    const wrongBody = await wrong.json();
    assert.equal(wrongBody.ok, false);
    assert.match(wrongBody.error, /invalid smoke secret/);
    assert.equal(JSON.stringify(wrongBody).includes(SMOKE_SECRET), false);
  });

  it('POST /api/smoke is refused in production even with a valid secret', async () => {
    const { port } = await listen({
      SUPABASE_URL: PARENT_URL,
      APP_ENV: 'production',
      SMOKE_SECRET,
    });

    const res = await smoke(port, { secret: SMOKE_SECRET });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /disabled in production/);
  });

  it('POST /api/smoke is refused when VERCEL_ENV is production', async () => {
    const { port } = await listen({
      SUPABASE_URL: PARENT_URL,
      VERCEL_ENV: 'production',
      SMOKE_SECRET,
    });

    const res = await smoke(port, { secret: SMOKE_SECRET });
    assert.equal(res.status, 403);
  });

  it('POST /api/smoke runs boot and skips auth/db when fixtures are absent', async () => {
    const { port } = await listen({
      SUPABASE_URL: DEVELOP_URL,
      APP_ENV: 'staging',
      SMOKE_SECRET,
    });

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
  });

  it('POST /api/smoke uses the user-JWT client for auth and RLS db read', async () => {
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

    const { port } = await listen(
      {
        SUPABASE_URL: DEVELOP_URL,
        APP_ENV: 'staging',
        SMOKE_SECRET,
        SMOKE_USER_JWT: 'fixture-user-jwt',
        SMOKE_DB_TABLE: 'smoke_fixture',
        SMOKE_DB_SELECT: 'id',
        SUPABASE_ANON_KEY: 'anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'must-not-leak',
      },
      { createUserClient }
    );

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
  });
});
