/**
 * Timeouts and spend-safe defaults for the OpenAI-primary turn loop.
 */

export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_MAX_OUTPUT_TOKENS = 1024;
export const DEFAULT_TEMPERATURE = 0.2;
export const DEFAULT_PROVIDER_TIMEOUT_MS = 25_000;
export const DEFAULT_TURN_TIMEOUT_MS = 45_000;
export const DEFAULT_MAX_TOOL_ROUNDS = 6;
export const DEFAULT_MAX_HISTORY_MESSAGES = 24;
export const DEFAULT_MAX_COMPLETION_TOKENS_PER_TURN = 8_000;
export const DEFAULT_TOOL_RESULT_CHARS = 8_000;

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function resolveChatLimits(env = process.env) {
  return Object.freeze({
    model: String(env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL).trim() || DEFAULT_OPENAI_MODEL,
    baseUrl: String(env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, ''),
    maxOutputTokens: intEnv(env.OPENAI_MAX_OUTPUT_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS, 16, 4096),
    temperature: DEFAULT_TEMPERATURE,
    providerTimeoutMs: intEnv(env.OPENAI_TIMEOUT_MS, DEFAULT_PROVIDER_TIMEOUT_MS, 5_000, 60_000),
    turnTimeoutMs: intEnv(env.CHAT_TURN_TIMEOUT_MS, DEFAULT_TURN_TIMEOUT_MS, 5_000, 90_000),
    maxToolRounds: intEnv(env.CHAT_MAX_TOOL_ROUNDS, DEFAULT_MAX_TOOL_ROUNDS, 1, 12),
    maxHistoryMessages: intEnv(env.CHAT_MAX_HISTORY, DEFAULT_MAX_HISTORY_MESSAGES, 2, 48),
    maxCompletionTokensPerTurn: DEFAULT_MAX_COMPLETION_TOKENS_PER_TURN,
    toolResultChars: DEFAULT_TOOL_RESULT_CHARS,
  });
}

function intEnv(raw, fallback, min, max) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}
