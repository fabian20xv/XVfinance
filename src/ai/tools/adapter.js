/**
 * Thin OpenAI tool adapters over the E2 allowlist.
 * Schemas and handlers stay in src/chat/* — this file only maps names + JSON Schema.
 */
import { TOOL_ALLOWLIST, listToolNames } from '../../chat/tool-router.js';
import { isConfirmOnWriteBlocked } from './confirm-policy.js';

/**
 * @param {string} name
 * @param {{ description?: string, schema?: object }} spec
 */
export function toOpenAITool(name, spec) {
  const parameters =
    spec?.schema && typeof spec.schema === 'object'
      ? spec.schema
      : { type: 'object', additionalProperties: false, properties: {} };
  return {
    type: 'function',
    function: {
      name,
      description: spec?.description || `Allowlisted XVfinance tool ${name}`,
      parameters,
    },
  };
}

/**
 * Registry: every E2 allowlisted name, including confirm/reject (not model-callable).
 * @param {typeof TOOL_ALLOWLIST} [tools]
 */
export function agentToolRegistry(tools = TOOL_ALLOWLIST) {
  const registry = Object.create(null);
  for (const name of listToolNames(tools)) {
    const spec = tools[name];
    registry[name] = Object.freeze({
      name,
      description: spec.description,
      schema: spec.schema,
      agentCallable: !isConfirmOnWriteBlocked(name),
      openai: toOpenAITool(name, spec),
    });
  }
  return Object.freeze(registry);
}

/**
 * Definitions sent to the model (confirm/reject omitted).
 * @param {typeof TOOL_ALLOWLIST} [tools]
 */
export function openaiToolDefinitions(tools = TOOL_ALLOWLIST) {
  const registry = agentToolRegistry(tools);
  return Object.values(registry)
    .filter((entry) => entry.agentCallable)
    .map((entry) => entry.openai);
}

/**
 * @param {string} name
 * @param {typeof TOOL_ALLOWLIST} [tools]
 */
export function getAgentTool(name, tools = TOOL_ALLOWLIST) {
  return agentToolRegistry(tools)[name] ?? null;
}
