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

  it('GET /v1/proposals/:id/confirm-card and workspace-panel share proposal_id', async (t) => {
    const token = await mint();
    const calls = [];
    await withServer(
      t,
      {
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

  it('POST /v1/proposals/:id/confirm dispatches confirm_proposal', async (t) => {
    const token = await mint();
    await withServer(
      t,
      {
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
