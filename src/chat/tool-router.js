/**
 * Chat tool router: allowlist + JSON Schema + user-JWT client (RLS).
 * Never imports server/service-role modules.
 */
import {
  ALLOWED_SUPABASE_PROJECT_REF,
  ALLOWED_SUPABASE_URL,
} from '../config/supabase-lock.js';
import {
  assertNoServiceRoleEnv,
  assertNotServiceRoleClient,
  createChatToolEnv,
} from '../security/service-role-guard.js';
import { validateAgainstSchema } from './json-schema.js';
import { createUserScopedClient } from './user-client.js';

/**
 * E2 stub catalog. E3+ read/proposal tools register here later.
 */
export const TOOL_ALLOWLIST = Object.freeze({
  get_session: Object.freeze({
    description: 'Return the authenticated user, firm, and role.',
    schema: Object.freeze({
      type: 'object',
      additionalProperties: false,
      properties: {},
    }),
    audit: Object.freeze({
      action: 'session.read',
      entityTable: 'firm_members',
      sensitive: true,
    }),
    async handler({ session }) {
      return {
        user_id: session.userId,
        firm_id: session.firmId,
        role: session.role,
      };
    },
  }),
  health: Object.freeze({
    description: 'Liveness probe for the locked Supabase project.',
    schema: Object.freeze({
      type: 'object',
      additionalProperties: false,
      properties: {},
    }),
    audit: null,
    async handler() {
      return {
        status: 'ok',
        project_ref: ALLOWED_SUPABASE_PROJECT_REF,
        supabase_url: ALLOWED_SUPABASE_URL,
      };
    },
  }),
});

/**
 * @param {object} options
 * @param {string} options.name
 * @param {unknown} [options.args]
 * @param {{ userId: string, firmId: string, role: string }} options.session
 * @param {string} options.userJwt
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {typeof createUserScopedClient} [options.createUserClient]
 * @param {typeof TOOL_ALLOWLIST} [options.tools]
 */
export async function dispatchTool({
  name,
  args,
  session,
  userJwt,
  env = process.env,
  createUserClient = createUserScopedClient,
  tools = TOOL_ALLOWLIST,
}) {
  const spec = tools[name];
  if (!spec) {
    return {
      ok: false,
      error: { code: 'unknown_tool', message: `Unknown or disallowed chat tool: ${name}` },
    };
  }

  const isolatedEnv = createChatToolEnv(env);
  assertNoServiceRoleEnv(isolatedEnv);

  const input = args == null ? {} : args;
  const validated = validateAgainstSchema(spec.schema, input);
  if (!validated.ok) {
    return {
      ok: false,
      error: {
        code: 'invalid_args',
        message: `JSON Schema validation failed for ${name}`,
        details: validated.errors,
      },
    };
  }

  if (!userJwt) {
    return {
      ok: false,
      error: { code: 'unauthenticated', message: 'Chat tools require a user JWT.' },
    };
  }

  const client = createUserClient(userJwt, isolatedEnv);
  assertNotServiceRoleClient(client);

  try {
    const data = await spec.handler({
      session,
      client,
      args: validated.value,
      env: isolatedEnv,
    });
    return { ok: true, data, audit: spec.audit ?? null };
  } catch (err) {
    return {
      ok: false,
      error: { code: 'tool_failed', message: err.message },
    };
  }
}
