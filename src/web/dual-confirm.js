/**
 * Dual-confirm: chat.confirm_card and workspace.diff_confirm_panel share proposal_id.
 */

export const CONFIRM_CARD_UI = 'chat.confirm_card';
export const DIFF_PANEL_UI = 'workspace.diff_confirm_panel';
export const RECEIPTS_PANEL_UI = 'workspace.receipts_panel';

const CONFIRM_CARD_FIELDS = Object.freeze([
  'proposal_id',
  'kind',
  'status',
  'db_status',
  'requires_role',
  'preview',
  'expires_at',
  'idempotency_key',
  'actions',
]);

/**
 * @param {object} card
 * @returns {{
 *   ui: string,
 *   proposal_id: string | null,
 *   kind: string | null,
 *   status: string | null,
 *   db_status: string | null,
 *   requires_role: string | null,
 *   preview: { title?: string, summary?: string } | null,
 *   expires_at: string | null,
 *   idempotency_key: string | null,
 *   actions: Array<{ action?: string, method?: string, path?: string }>
 * } | null}
 */
export function confirmCardFields(card) {
  if (!card || typeof card !== 'object') {
    return null;
  }
  const out = { ui: card.ui ?? CONFIRM_CARD_UI };
  for (const key of CONFIRM_CARD_FIELDS) {
    out[key] = card[key] ?? null;
  }
  out.actions = Array.isArray(card.actions) ? card.actions : [];
  return out;
}

/**
 * @param {object} card
 * @param {object} panel
 */
export function assertSharedProposalId(card, panel) {
  const cardId = card?.proposal_id ?? null;
  const panelId = panel?.proposal_id ?? null;
  if (!cardId || !panelId || cardId !== panelId) {
    const error = new Error('ConfirmCard and DiffConfirmPanel must share proposal_id');
    error.code = 'proposal_id_mismatch';
    throw error;
  }
  return cardId;
}

/**
 * @param {Array<{ action?: string, method?: string, path?: string }>} actions
 * @param {'confirm' | 'reject'} action
 * @returns {{ method: string, path: string } | null}
 */
export function actionPath(actions, action) {
  const hit = (actions ?? []).find((row) => row.action === action);
  if (hit?.path) {
    return { method: hit.method || 'POST', path: hit.path };
  }
  return null;
}

/**
 * Meeting send workspace panel always has public_url: null.
 * @param {object} panel
 * @returns {object}
 */
export function withNullPublicUrl(panel) {
  if (!panel || typeof panel !== 'object') {
    return panel;
  }
  const next = { ...panel, public_url: null };
  if (Array.isArray(panel.receipts)) {
    next.receipts = panel.receipts.map((row) => ({ ...row, public_url: null }));
  }
  return next;
}
