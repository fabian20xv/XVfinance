/**
 * Typed errors from chat tools. Safe to import from src/chat (no server).
 */
export class ToolError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
  }
}

export function notFound(message) {
  return new ToolError('not_found', message);
}

export function forbidden(message, code = 'forbidden') {
  return new ToolError(code, message);
}

export function conflict(message, code = 'conflict') {
  return new ToolError(code, message);
}

export function badArgs(message) {
  return new ToolError('invalid_args', message);
}
