/**
 * Dana v1.2 receipt marks. Display [1] / dashed [?] — never the word "citation".
 * Does not invent receipts; missing/RLS stays empty.
 */

export const RECEIPT_UNAVAILABLE = 'Not available for this account';
export const RECEIPT_NO_LAST_MEETING = 'No last meeting on file';
export const RECEIPT_OPEN_WORKSPACE = 'Open in workspace';

const SOURCE_TYPE = Object.freeze({
  notes: 'Note',
  holdings: 'Holding',
  portfolios: 'Portfolio',
  proposals: 'Proposal',
  reports: 'Report',
  clients: 'Client',
});

/**
 * 1-based mark for a real receipt. Missing → dashed [?].
 * @param {number} index
 * @param {boolean} [missing]
 */
export function receiptMark(index, missing = false) {
  if (missing || index == null || index < 0) {
    return '[?]';
  }
  return `[${index + 1}]`;
}

/**
 * @param {string | null | undefined} sourceTable
 */
export function sourceTypeLabel(sourceTable) {
  if (!sourceTable) {
    return 'Source';
  }
  return SOURCE_TYPE[sourceTable] ?? sourceTable;
}

/**
 * @param {string | null | undefined} iso
 * @param {number} [now]
 */
export function relativeTime(iso, now = Date.now()) {
  if (!iso) {
    return 'unknown time';
  }
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) {
    return 'unknown time';
  }
  const deltaMs = now - then;
  const mins = Math.round(Math.abs(deltaMs) / 60000);
  if (mins < 1) {
    return 'just now';
  }
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hours = Math.round(mins / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/**
 * Plain source type + relative time. No "citation" wording.
 * @param {{ source_table?: string, as_of?: string | null }} receipt
 * @param {number} [now]
 */
export function receiptTitle(receipt, now = Date.now()) {
  return `${sourceTypeLabel(receipt?.source_table)} · ${relativeTime(receipt?.as_of, now)}`;
}

/**
 * One factual line. Empty if the payload has nothing — never invent.
 * @param {{ excerpt?: string, label?: string }} receipt
 */
export function receiptBodyLine(receipt) {
  const raw = receipt?.excerpt || receipt?.label || '';
  const line = String(raw).split('\n')[0].trim();
  return line;
}

/**
 * Workspace deep-link only when the receipt already carries a path.
 * @param {{ path?: string | null }} receipt
 * @returns {string | null}
 */
export function receiptDeepLink(receipt) {
  return receipt?.path || null;
}

/**
 * Map API citation tokens ([R1], [1]) to the receipts array index.
 * Unknown marks are missing — caller must render dashed [?] and not invent.
 * @param {string} token
 * @param {Array<{ citation?: string }>} receipts
 * @returns {{ index: number, missing: boolean }}
 */
export function markIndexForToken(token, receipts) {
  const inner = String(token).replace(/[[\]]/g, '');
  const list = Array.isArray(receipts) ? receipts : [];
  const byCitation = list.findIndex((row) => row?.citation === inner || row?.citation === `R${inner}`);
  if (byCitation >= 0) {
    return { index: byCitation, missing: false };
  }
  const numeric = Number.parseInt(inner.replace(/^R/i, ''), 10);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= list.length) {
    return { index: numeric - 1, missing: false };
  }
  return { index: -1, missing: true };
}

/**
 * FocusChip entity label, e.g. "NVDA · impact".
 * @param {string | null | undefined} symbol
 * @param {string} [mode]
 */
export function focusEntityLabel(symbol, mode = 'impact') {
  if (!symbol) {
    return null;
  }
  return `${symbol} · ${mode}`;
}

export const RECEIPT_CITE_RE = /\[(?:R)?\d+\]/g;
