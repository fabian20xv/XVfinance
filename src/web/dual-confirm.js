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

/**
 * Patch chat.confirm_card / workspace.diff_confirm_panel onto a terminal status
 * without changing proposal_id (twins stay aligned).
 * @param {{ proposal_id?: string } | null | undefined} model
 * @param {string} proposalId
 * @param {{ status: string, db_status?: string | null }} patch
 */
export function applyTwinTerminalState(model, proposalId, patch) {
  if (!model || model.proposal_id !== proposalId) {
    return model;
  }
  const next = { ...model, status: patch.status };
  if (patch.db_status != null) {
    next.db_status = patch.db_status;
  }
  return next;
}

/**
 * @param {Array<{ confirmCard?: { proposal_id?: string } | null }>} messages
 * @param {string} proposalId
 * @param {{ status: string, db_status?: string | null }} patch
 */
export function applyMessageConfirmCardTerminal(messages, proposalId, patch) {
  return (messages ?? []).map((row) => {
    if (row?.confirmCard?.proposal_id !== proposalId) {
      return row;
    }
    return { ...row, confirmCard: applyTwinTerminalState(row.confirmCard, proposalId, patch) };
  });
}

/**
 * @param {Record<string, { proposalId?: string, status?: string, at?: Date }> | null | undefined} outcomes
 * @param {string | null | undefined} proposalId
 */
export function twinOutcome(outcomes, proposalId) {
  if (!proposalId || !outcomes) {
    return null;
  }
  const hit = outcomes[proposalId];
  return hit?.proposalId === proposalId ? hit : null;
}

/**
 * Terminal confirm/dismiss for a twin. Prefers the local API outcome; falls
 * back to the card/panel status so buttons do not return after a fade.
 * @param {{ proposalId?: string, status?: string, at?: Date } | null | undefined} outcome
 * @param {string} proposalId
 * @param {string | null | undefined} status
 */
export function resolveTwinOutcome(outcome, proposalId, status) {
  if (
    outcome?.proposalId === proposalId &&
    (outcome.status === 'confirmed' || outcome.status === 'rejected')
  ) {
    return outcome;
  }
  if (status === 'rejected') {
    return { status: 'rejected', at: outcome?.at, proposalId };
  }
  if (status === 'confirmed' || status === 'applied') {
    return { status: 'confirmed', at: outcome?.at, proposalId };
  }
  return null;
}

/**
 * Persist per-proposal terminal confirm/dismiss so chat ConfirmCard does not
 * snap back to Confirm/Dismiss after the workspace panel unmounts.
 * @param {Record<string, object>} prev
 * @param {string} proposalId
 * @param {'confirmed' | 'rejected'} status
 * @param {Date} [at]
 */
export function rememberConfirmOutcome(prev, proposalId, status, at = new Date()) {
  return { ...prev, [proposalId]: { status, at, proposalId } };
}
