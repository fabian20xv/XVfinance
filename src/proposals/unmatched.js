/**
 * Holdings-import unmatched symbols. Confirm is blocked until the list is empty.
 */

/**
 * @param {Record<string, unknown> | null | undefined} payload
 * @returns {Array<{ symbol?: string } | string>}
 */
export function unmatchedSymbols(payload) {
  const list = payload?.unmatched;
  if (!Array.isArray(list)) {
    return [];
  }
  return list.filter((row) => row != null && row !== '');
}

/**
 * @param {Record<string, unknown> | null | undefined} payload
 */
export function hasUnmatchedSymbols(payload) {
  return unmatchedSymbols(payload).length > 0;
}

/**
 * @param {Array<{ symbol?: string } | string>} unmatched
 */
export function unmatchedMessage(unmatched) {
  const symbols = unmatched
    .map((row) => (typeof row === 'string' ? row : row?.symbol))
    .filter(Boolean);
  const label = symbols.length > 0 ? symbols.join(', ') : 'unknown';
  return `Unmatched symbols block confirm: ${label}`;
}
