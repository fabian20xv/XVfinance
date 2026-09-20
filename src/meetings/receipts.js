/**
 * CA-9.2 Meeting 1-pager receipts UI contract.
 * Firm-scoped citations only — never an anonymous public URL.
 */

export const RECEIPTS_UI = 'workspace.receipts_panel';
export const MEETING_PURPOSE = 'meeting_one_pager';
export const MEETING_CHANNELS = Object.freeze(['email', 'export']);

const SOURCE_PATH = {
  notes: 'notes',
  holdings: 'holdings',
  portfolios: 'portfolios',
  proposals: 'proposals',
  reports: 'reports',
  clients: 'clients',
};

/**
 * Internal firm pointer (not a public share URL).
 * @param {string} sourceTable
 * @param {string} sourceId
 */
export function receiptPath(sourceTable, sourceId) {
  const slug = SOURCE_PATH[sourceTable] ?? sourceTable;
  return `/v1/${slug}/${sourceId}`;
}

/**
 * @param {object} input
 */
export function makeReceipt(input) {
  const source_table = input.source_table;
  const source_id = input.source_id;
  return {
    id: input.id,
    citation: input.citation,
    source_table,
    source_id,
    firm_id: input.firm_id,
    label: input.label,
    excerpt: input.excerpt ?? '',
    as_of: input.as_of ?? null,
    path: receiptPath(source_table, source_id),
    auditable: true,
    public_url: null,
  };
}

/**
 * Workspace panel that shows receipts alongside the draft.
 * @param {object} report
 */
export function receiptsPanel(report) {
  const receipts = Array.isArray(report?.receipts) ? report.receipts : [];
  const sent = Boolean(report?.sent_at);
  return {
    ui: RECEIPTS_UI,
    report_id: report?.id ?? null,
    client_id: report?.client_id ?? null,
    purpose: report?.purpose ?? MEETING_PURPOSE,
    status: report?.status ?? 'draft',
    receipts,
    public_url: null,
    client_facing: report?.status === 'published' && sent,
    auditable: true,
    sent_at: report?.sent_at ?? null,
    send_channel: report?.send_channel ?? null,
  };
}
