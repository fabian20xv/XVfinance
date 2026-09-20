/**
 * Dana v1.2 confirm-pulse copy + motion helpers.
 * Dual-confirm inventory (chat.confirm_card + workspace.diff_confirm_panel) is unchanged.
 */

import { MOTION } from './tokens.js';

export const CONFIRM_COPY = Object.freeze({
  primary: 'Confirm change',
  secondary: 'Dismiss proposal',
});

/**
 * @param {Date | string | number} [at]
 */
export function confirmedLine(at = new Date()) {
  const date = at instanceof Date ? at : new Date(at);
  const time = Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `Confirmed · ${time} · you`;
}

export const CONFIRM_SUCCESS_FADE_MS = MOTION.successFadeMs;
export const CONFIRM_PULSE_MS = MOTION.crossHighlightMs;

/**
 * True when the unread (leading) edge of a panel sits outside its scrollport.
 * @param {{ top: number, bottom: number }} rect
 * @param {{ top: number, bottom: number }} viewport
 */
export function isUnreadEdgeClipped(rect, viewport) {
  if (!rect || !viewport) {
    return false;
  }
  return rect.top < viewport.top || rect.bottom > viewport.bottom;
}

/**
 * Scroll DiffConfirmPanel into view only when its unread edge is clipped.
 * @param {Element | null} panel
 * @param {Element | null} [scrollParent]
 */
export function scrollDiffPanelIfClipped(panel, scrollParent = panel?.parentElement ?? null) {
  if (!panel || !scrollParent) {
    return false;
  }
  const rect = panel.getBoundingClientRect();
  const viewport = scrollParent.getBoundingClientRect();
  if (!isUnreadEdgeClipped(rect, viewport)) {
    return false;
  }
  if (typeof panel.scrollIntoView === 'function') {
    panel.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }
  return true;
}
