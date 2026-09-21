/**
 * Execute an allowlisted tool for the agent turn via the existing tool-router.
 * Never imports server/service-role. User JWT + RLS only.
 */
import { dispatchTool, TOOL_ALLOWLIST } from '../../chat/tool-router.js';
import {
  CONFIRM_ON_WRITE_CODE,
  CONFIRM_ON_WRITE_MESSAGE,
  isConfirmOnWriteBlocked,
} from './confirm-policy.js';

/**
 * @param {string} raw
 */
export function parseToolCallArguments(raw) {
  if (raw == null || raw === '') {
    return { ok: true, value: {} };
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return { ok: true, value: raw };
  }
  if (typeof raw !== 'string') {
    return { ok: false, error: { code: 'invalid_args', message: 'Tool arguments must be a JSON object.' } };
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: { code: 'invalid_args', message: 'Tool arguments must be a JSON object.' } };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, error: { code: 'invalid_args', message: 'Tool arguments were not valid JSON.' } };
  }
}

/**
 * @param {object} options
 * @param {string} options.name
 * @param {unknown} [options.args]
 * @param {{ userId: string, firmId: string, role: string }} options.session
 * @param {string} options.userJwt
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {typeof dispatchTool} [options.dispatch]
 */
export async function executeAgentTool({
  name,
  args,
  session,
  userJwt,
  env,
  dispatch = dispatchTool,
}) {
  if (!name || typeof name !== 'string' || !TOOL_ALLOWLIST[name]) {
    return {
      ok: false,
      error: { code: 'unknown_tool', message: `Unknown or disallowed chat tool: ${name}` },
    };
  }

  if (isConfirmOnWriteBlocked(name)) {
    return {
      ok: false,
      error: { code: CONFIRM_ON_WRITE_CODE, message: CONFIRM_ON_WRITE_MESSAGE },
    };
  }

  if (!userJwt) {
    return {
      ok: false,
      error: { code: 'unauthenticated', message: 'Chat tools require a user JWT.' },
    };
  }

  return dispatch({
    name,
    args: args ?? {},
    session,
    userJwt,
    env,
  });
}

/**
 * Serialize a tool result for the model. Truncate to keep spend bounded.
 * @param {unknown} result
 * @param {number} [maxChars]
 */
export function stringifyToolResult(result, maxChars = 8000) {
  let text;
  try {
    text = JSON.stringify(result);
  } catch {
    text = '{"ok":false,"error":{"code":"tool_failed","message":"Tool result was not serializable."}}';
  }
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars - 32)}…[truncated]`;
}
