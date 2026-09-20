import { SPLIT } from './tokens.js';

/**
 * Clamp the chat pane width to Dana v1.1 (48–64). Default 56.
 * @param {unknown} value
 * @returns {number}
 */
export function clampChatPct(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    return SPLIT.defaultChatPct;
  }
  return Math.min(SPLIT.maxChatPct, Math.max(SPLIT.minChatPct, n));
}

/**
 * @param {number} chatPct
 */
export function workspacePct(chatPct) {
  return 100 - clampChatPct(chatPct);
}

export function resetChatPct() {
  return SPLIT.defaultChatPct;
}
