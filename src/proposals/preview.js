/**
 * Preview + diff payload for chat confirm cards and the workspace panel.
 */

function count(list) {
  return Array.isArray(list) ? list.length : 0;
}

/**
 * @param {string} kind
 * @param {Record<string, unknown>} payload
 */
export function buildPreview(kind, payload = {}) {
  switch (kind) {
    case 'holding_changes':
      return {
        title: 'Holding changes',
        summary: `${count(payload.changes)} change(s) on portfolio ${payload.portfolio_id ?? ''}`.trim(),
        diff: payload.changes ?? [],
      };
    case 'client_upsert':
      return {
        title: payload.id ? 'Update client' : 'Create client',
        summary: payload.display_name ?? 'Client upsert',
        diff: payload,
      };
    case 'contact_upsert':
      return {
        title: payload.id ? 'Update contact' : 'Create contact',
        summary: payload.full_name ?? 'Contact upsert',
        diff: payload,
      };
    case 'watchlist_upsert':
      return {
        title: payload.id ? 'Update watchlist' : 'Create watchlist',
        summary: `${payload.name ?? 'Watchlist'} (${count(payload.items)} item(s))`,
        diff: payload.items ?? [],
      };
    case 'note_upsert':
      return {
        title: payload.id ? 'Update note' : 'Add note',
        summary: String(payload.body ?? '').slice(0, 120),
        diff: payload,
      };
    case 'portfolio_upsert':
      return {
        title: payload.id ? 'Update portfolio' : 'Create portfolio',
        summary: payload.name ?? 'Portfolio upsert',
        diff: payload,
      };
    case 'report_publish':
      return {
        title: 'Publish report',
        summary: payload.title ?? payload.report_id ?? 'Publish report',
        diff: { report_id: payload.report_id, public_url: null },
      };
    case 'holdings_import':
      return {
        title: 'Import holdings CSV',
        summary: `${count(payload.matched)} matched, ${count(payload.unmatched)} unmatched`,
        diff: {
          matched: payload.matched ?? [],
          unmatched: payload.unmatched ?? [],
        },
        confirm_blocked: count(payload.unmatched) > 0,
      };
    case 'scratchpad_promote':
      return {
        title: 'Promote scratchpad (not live until confirm)',
        summary: `${count(payload.changes)} change(s) — watermarked, not source of truth until confirm`,
        diff: payload.changes ?? [],
        watermark: payload.watermark ?? 'SCRATCHPAD — not live / not source of truth',
        source_of_truth: false,
      };
    default:
      return {
        title: kind,
        summary: 'Proposal',
        diff: payload,
      };
  }
}
