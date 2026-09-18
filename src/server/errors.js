export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   */
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  toJSON() {
    return { code: this.code, message: this.message };
  }
}

export function unauthorized(message, code = 'unauthenticated') {
  return new ApiError(401, code, message);
}

export function forbidden(message, code = 'forbidden') {
  return new ApiError(403, code, message);
}

export function badRequest(message, code = 'bad_request') {
  return new ApiError(400, code, message);
}
