/**
 * OpenAI-primary chat completions client (fetch). No service-role.
 * Degrades when OPENAI_API_KEY is missing or a placeholder.
 */

export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
export const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

export class ModelUnavailableError extends Error {
  /**
   * @param {string} message
   * @param {string} [code]
   */
  constructor(message, code = 'model_unavailable') {
    super(message);
    this.name = 'ModelUnavailableError';
    this.code = code;
  }
}

/**
 * @param {unknown} value
 */
export function isPlaceholderSecret(value) {
  if (value == null) {
    return true;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return true;
  }
  return /^replace-with|changeme|placeholder|^sk-your/i.test(trimmed) || trimmed === 'stub';
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function resolveOpenAIApiKey(env = process.env) {
  const key = env?.OPENAI_API_KEY;
  if (isPlaceholderSecret(key)) {
    return null;
  }
  return String(key).trim();
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function resolveOpenAIModel(env = process.env) {
  const model = String(env?.OPENAI_MODEL || '').trim();
  return model || DEFAULT_OPENAI_MODEL;
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @param {object} options
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [options.env]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {string} [options.apiKey]
 * @param {string} [options.model]
 */
export function createOpenAIProvider({
  env = process.env,
  fetchImpl = fetch,
  apiKey = resolveOpenAIApiKey(env),
  model = resolveOpenAIModel(env),
} = {}) {
  return {
    model,
    available: Boolean(apiKey),
    /**
     * @param {object} request
     * @param {{ messages: object[], tools?: object[], stream?: boolean }} request
     * @param {AbortSignal} [signal]
     */
    async complete(request, signal) {
      if (!apiKey) {
        throw new ModelUnavailableError(
          'OPENAI_API_KEY is not set. Natural-language agent turns are unavailable; slash/JSON tools still work via the E2 allowlist.'
        );
      }
      const body = {
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
      };
      if (request.tools?.length) {
        body.tools = request.tools;
        body.tool_choice = request.tool_choice ?? 'auto';
      }
      const response = await fetchImpl(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });
      const text = await response.text();
      const json = parseJsonSafe(text) ?? {};
      if (!response.ok) {
        const message = json.error?.message || text || `OpenAI HTTP ${response.status}`;
        throw new ModelUnavailableError(message, 'model_http_error');
      }
      const choice = json.choices?.[0];
      if (!choice?.message) {
        throw new ModelUnavailableError('OpenAI returned no message', 'model_empty');
      }
      return {
        id: json.id,
        model: json.model ?? model,
        finish_reason: choice.finish_reason ?? 'stop',
        message: choice.message,
      };
    },
  };
}
