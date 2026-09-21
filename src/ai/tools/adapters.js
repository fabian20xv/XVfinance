/**
 * Thin OpenAI function-tool adapters over the EXISTING E2 chat allowlist.
 * No second allowlist — names and JSON Schemas come from TOOL_ALLOWLIST.
 */
import { dispatchTool, listToolNames, TOOL_ALLOWLIST } from '../../chat/tool-router.js';

export { dispatchTool, listToolNames, TOOL_ALLOWLIST };

/**
 * @param {typeof TOOL_ALLOWLIST} [tools]
 * @returns {Array<{ type: 'function', function: { name: string, description: string, parameters: object } }>}
 */
export function openaiToolsFromAllowlist(tools = TOOL_ALLOWLIST) {
  return listToolNames(tools).map((name) => {
    const spec = tools[name];
    return {
      type: 'function',
      function: {
        name,
        description: spec?.description || name,
        parameters: spec?.schema || { type: 'object', additionalProperties: false, properties: {} },
      },
    };
  });
}

/**
 * Dispatch one allowlisted tool. Same router as POST /v1/tools.
 *
 * @param {object} options
 * @param {string} options.name
 * @param {unknown} [options.args]
 * @param {{ userId: string, firmId: string, role: string }} options.session
 * @param {string} options.userJwt
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [options.env]
 * @param {typeof TOOL_ALLOWLIST} [options.tools]
 * @param {Function} [options.dispatch]
 */
export async function dispatchAllowlistedTool(options) {
  const dispatch = options.dispatch ?? dispatchTool;
  return dispatch({
    name: options.name,
    args: options.args ?? {},
    session: options.session,
    userJwt: options.userJwt,
    env: options.env,
    tools: options.tools ?? TOOL_ALLOWLIST,
    createUserClient: options.createUserClient,
  });
}
