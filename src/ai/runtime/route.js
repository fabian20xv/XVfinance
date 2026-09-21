/**
 * RFC-011 agent chat HTTP path. Canonical stream is POST /v1/ai/chat.
 * /v1/chat remains an alias onto the same handler.
 */
export const AI_CHAT_PATH = '/v1/ai/chat';
export const AI_CHAT_PATH_ALIASES = Object.freeze(['/v1/chat']);

/**
 * @param {string} path
 */
export function isAiChatPath(path) {
  return path === AI_CHAT_PATH || AI_CHAT_PATH_ALIASES.includes(path);
}
