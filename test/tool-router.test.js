import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dispatchTool } from '../src/chat/tool-router.js';
import { validateAgainstSchema } from '../src/chat/json-schema.js';
import { SMOKE_FIRM_ID, SMOKE_MANAGER_ID } from '../src/db/smoke-ids.js';
import { markServiceRoleClient } from '../src/security/service-role-guard.js';

const LOCKED_URL = 'https://krcwpupbdizzjyydzaqp.supabase.co';
const session = {
  userId: SMOKE_MANAGER_ID,
  firmId: SMOKE_FIRM_ID,
  role: 'manager',
};
const env = {
  SUPABASE_URL: LOCKED_URL,
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'must-not-leak',
  SUPABASE_JWT_SECRET: 'must-not-leak-either',
};

describe('CA-2.2 tool router', () => {
  it('rejects tools that are not on the allowlist', async () => {
    const result = await dispatchTool({
      name: 'drop_production',
      args: {},
      session,
      userJwt: 'user-jwt',
      env,
      createUserClient: () => ({ kind: 'user' }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'unknown_tool');
  });

  it('validates args against JSON Schema', async () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['client_id'],
      properties: { client_id: { type: 'string' } },
    };
    const bad = validateAgainstSchema(schema, { extra: 1 });
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.some((e) => /client_id is required/.test(e)));
    assert.ok(bad.errors.some((e) => /extra is not allowed/.test(e)));

    const result = await dispatchTool({
      name: 'get_session',
      args: { unexpected: true },
      session,
      userJwt: 'user-jwt',
      env,
      createUserClient: () => ({ kind: 'user' }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'invalid_args');
  });

  it('builds a user-JWT client and never a service-role client', async () => {
    let seenJwt;
    let seenEnv;
    const result = await dispatchTool({
      name: 'get_session',
      args: {},
      session,
      userJwt: 'user-jwt-token',
      env,
      createUserClient: (jwt, isolated) => {
        seenJwt = jwt;
        seenEnv = isolated;
        return { kind: 'user' };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(seenJwt, 'user-jwt-token');
    assert.equal(seenEnv.SUPABASE_SERVICE_ROLE_KEY, undefined);
    assert.equal(seenEnv.SUPABASE_JWT_SECRET, undefined);
    assert.deepEqual(result.data, {
      user_id: SMOKE_MANAGER_ID,
      firm_id: SMOKE_FIRM_ID,
      role: 'manager',
    });
    assert.equal(result.audit.action, 'session.read');
  });

  it('refuses a service-role client if one is injected', async () => {
    await assert.rejects(
      () =>
        dispatchTool({
          name: 'health',
          args: {},
          session,
          userJwt: 'user-jwt',
          env,
          createUserClient: () => markServiceRoleClient({ kind: 'admin' }),
        }),
      /cannot be used in chat tool context/
    );
  });

  it('returns the locked project from the health stub', async () => {
    const result = await dispatchTool({
      name: 'health',
      args: {},
      session,
      userJwt: 'user-jwt',
      env,
      createUserClient: () => ({ kind: 'user' }),
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.project_ref, 'krcwpupbdizzjyydzaqp');
    assert.equal(result.data.supabase_url, LOCKED_URL);
  });
});
