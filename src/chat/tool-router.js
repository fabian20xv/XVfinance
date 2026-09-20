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
import { GHOSTWRITER_TOOLS } from './ghostwriter-tools.js';
import { IMPORT_TOOLS } from './import-tools.js';
import { MARKET_TOOLS } from './market-tools.js';
import { PROPOSAL_TOOLS } from './proposal-tools.js';
import { READ_TOOLS } from './read-tools.js';
import { REPORT_TOOLS } from './report-tools.js';
import { SCRATCHPAD_TOOLS } from './scratchpad-tools.js';
import { SESSION_TOOLS } from './session-tools.js';
import { ToolError } from './tool-error.js';
import { createUserScopedClient } from './user-client.js';

const CORE_TOOLS = {
  get_session: {
    description: 'Return the authenticated user, firm, and role.',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    audit: {
      action: 'session.read',
      entityTable: 'firm_members',
      sensitive: true,
    },
    async handler({ session }) {
      return {
        user_id: session.userId,
        firm_id: session.firmId,
        role: session.role,
      };
    },
  },
  health: {
    description: 'Liveness probe for the locked Supabase project.',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    audit: null,
    async handler() {
      return {
        status: 'ok',
        project_ref: ALLOWED_SUPABASE_PROJECT_REF,
        supabase_url: ALLOWED_SUPABASE_URL,
      };
    },
  },
};

/**
 * E2 allowlist plus E3–E9 tools.
 */
export const TOOL_ALLOWLIST = Object.freeze({
  ...CORE_TOOLS,
  ...SESSION_TOOLS,
  ...READ_TOOLS,
  ...PROPOSAL_TOOLS,
  ...REPORT_TOOLS,
  ...IMPORT_TOOLS,
  ...MARKET_TOOLS,
  ...SCRATCHPAD_TOOLS,
  ...GHOSTWRITER_TOOLS,
});

function resolveAudit(spec, { args, data, session }) {
  if (!spec.audit) {
    return null;
  }
  const audit = typeof spec.audit === 'function' ? spec.audit({ args, data, session }) : { ...spec.audit };
  if (!audit) {
    return null;
  }
  return {
    ...audit,
    entityId: audit.entityId ?? data?.id ?? session.userId,
  };
}

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
    return { ok: true, data, audit: resolveAudit(spec, { args: validated.value, data, session }) };
  } catch (err) {
    if (err instanceof ToolError) {
      return {
        ok: false,
        error: { code: err.code, message: err.message },
      };
    }
    return {
      ok: false,
      error: { code: 'tool_failed', message: err.message },
    };
  }
}

export function listToolNames(tools = TOOL_ALLOWLIST) {
  return Object.keys(tools).sort();
}
