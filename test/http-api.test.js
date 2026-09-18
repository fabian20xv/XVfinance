import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SignJWT } from 'jose';
import { ALLOWED_JWT_ISSUER, ALLOWED_SUPABASE_URL } from '../src/config/supabase-lock.js';
import { SMOKE_FIRM_ID, SMOKE_MANAGER_ID } from '../src/db/smoke-ids.js';
import { startApiServer } from '../src/server/http.js';

const SECRET = 'xvfinance-test-jwt-secret-32chars!';

async function mint() {
  return new SignJWT({ role: 'authenticated', aud: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ALLOWED_JWT_ISSUER)
    .setSubject(SMOKE_MANAGER_ID)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(SECRET));
}

async function withServer(t, deps, fn) {
  const server = await startApiServer({
    port: 0,
    env: {
      SUPABASE_URL: ALLOWED_SUPABASE_URL,
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_JWT_SECRET: SECRET,
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
    await withServer(t, sessionDeps, async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/v1/session`);
      const body = await res.json();
      assert.equal(res.status, 401);
      assert.equal(body.ok, false);
      assert.equal(body.error.code, 'unauthenticated');
    });
  });

  it('POST /v1/tools runs get_session with a user JWT and writes an audit id', async (t) => {
    const audits = [];
    const token = await mint();
    await withServer(
      t,
      {
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
});
