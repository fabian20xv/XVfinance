/**
 * Speak 1.5 — client-only meeting presentation mode.
 * No /v1 route. Speak-ready is live only while the meeting workspace is open.
 * Toggle OFF or leaving that workspace tears the mode down.
 */

/** Body copy while speaking: 18px type on a 28px line. */
export const SPEAK_READY_BODY = Object.freeze({
  fontSizePx: 18,
  lineHeightPx: 28,
});

/** Shell chrome recedes to ink-muted at about 40% while the 1-pager stays full ink. */
export const SPEAK_READY_CHROME_ALPHA = 0.4;

/** Open the first receipt side-slip. Ignored while typing. Already-open is a no-op. */
export const SPEAK_RECEIPTS_KEY = 'r';

export const SPEAK_EMPTY_RECEIPTS = 'No receipts on this 1-pager';

/**
 * @param {boolean} ready
 * @param {string | null | undefined} workspaceMode
 */
export function resolveSpeakReady(ready, workspaceMode) {
  return Boolean(ready) && workspaceMode === 'meeting';
}

/**
 * @param {EventTarget | { tagName?: string, isContentEditable?: boolean } | null | undefined} target
 */
export function isTypingTarget(target) {
  if (!target || typeof target !== 'object') {
    return false;
  }
  const tag = 'tagName' in target ? String(target.tagName || '').toUpperCase() : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  return Boolean('isContentEditable' in target && target.isContentEditable);
}

/**
 * @param {{ key?: string, repeat?: boolean, metaKey?: boolean, ctrlKey?: boolean, altKey?: boolean, target?: EventTarget | { tagName?: string, isContentEditable?: boolean } | null }} event
 * @param {{ speakReady?: boolean, receiptCount?: number, openIndex?: number | null }} state
 * @returns {{ type: 'ignore' } | { type: 'empty' } | { type: 'open', index: number }}
 */
export function speakReceiptShortcut(event, state) {
  if (!state?.speakReady) {
    return { type: 'ignore' };
  }
  if (!event || event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
    return { type: 'ignore' };
  }
  if (isTypingTarget(event.target)) {
    return { type: 'ignore' };
  }
  const key = String(event.key || '');
  if (key !== SPEAK_RECEIPTS_KEY && key !== 'R') {
    return { type: 'ignore' };
  }
  const count = Number(state.receiptCount) || 0;
  if (count < 1) {
    return { type: 'empty' };
  }
  const open = state.openIndex;
  if (open == null || open < 0 || open >= count) {
    return { type: 'open', index: 0 };
  }
  return { type: 'ignore' };
}
