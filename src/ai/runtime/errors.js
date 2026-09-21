/**
 * Typed errors for the E11 chat runtime. Safe to import from src/ai (no server).
 */
export class ChatRuntimeError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} [status]
   */
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'ChatRuntimeError';
    this.code = code;
    this.status = status;
  }

  toJSON() {
    return { code: this.code, message: this.message };
  }
}

export function missingOpenAIKey() {
  return new ChatRuntimeError(
    'openai_api_key_missing',
    'OPENAI_API_KEY is missing. Set it on Preview/Production. Chat will not fake a model reply.',
    503
  );
}

export function chatTimeout(message = 'Chat turn timed out.') {
  return new ChatRuntimeError('openai_timeout', message, 504);
}

export function spendLimit(message) {
  return new ChatRuntimeError('openai_spend_limit', message, 429);
}

export function invalidChatArgs(message) {
  return new ChatRuntimeError('invalid_args', message, 400);
}
