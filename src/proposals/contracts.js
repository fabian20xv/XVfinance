/**
 * Dual-confirm UI contracts. Chat inline card and workspace panel share proposal_id.
 */
import { apiStatus } from './defaults.js';

/**
 * @param {string} proposalId
 */
export function proposalActions(proposalId) {
  return [
    {
      action: 'confirm',
      method: 'POST',
      path: `/v1/proposals/${proposalId}/confirm`,
      tool: 'confirm_proposal',
    },
    {
      action: 'reject',
      method: 'POST',
      path: `/v1/proposals/${proposalId}/reject`,
      tool: 'reject_proposal',
    },
  ];
}

/**
 * CA-4.3 chat inline confirm card (payload contract; no UI framework required).
 * @param {object} proposal
 */
export function confirmCard(proposal) {
  return {
    ui: 'chat.confirm_card',
    proposal_id: proposal.id,
    kind: proposal.kind,
    status: apiStatus(proposal),
    db_status: proposal.status,
    requires_role: proposal.requires_role,
    preview: proposal.preview ?? null,
    expires_at: proposal.expires_at ?? null,
    idempotency_key: proposal.idempotency_key ?? null,
    actions: proposalActions(proposal.id),
  };
}

/**
 * CA-4.4 workspace diff/confirm panel. Same proposal_id as the chat card.
 * @param {object} proposal
 */
export function workspacePanel(proposal) {
  const preview = proposal.preview ?? {};
  const panel = {
    ui: 'workspace.diff_confirm_panel',
    proposal_id: proposal.id,
    kind: proposal.kind,
    status: apiStatus(proposal),
    db_status: proposal.status,
    requires_role: proposal.requires_role,
    preview,
    diff: preview.diff ?? proposal.payload ?? {},
    payload: proposal.payload ?? {},
    expires_at: proposal.expires_at ?? null,
    actions: proposalActions(proposal.id),
  };
  if (proposal.kind === 'meeting_send') {
    panel.receipts = preview.receipts ?? proposal.payload?.receipts ?? [];
    panel.receipts_ui = 'workspace.receipts_panel';
    panel.public_url = null;
  }
  return panel;
}

/**
 * Public proposal resource (CA-4.1).
 * @param {object} row
 */
export function publicProposal(row) {
  return {
    id: row.id,
    firm_id: row.firm_id,
    kind: row.kind,
    status: apiStatus(row),
    db_status: row.status,
    preview: row.preview ?? {},
    payload: row.payload ?? {},
    requires_role: row.requires_role,
    requires_manager: row.requires_manager,
    expires_at: row.expires_at ?? null,
    idempotency_key: row.idempotency_key ?? null,
    created_by: row.created_by,
    confirmed_by: row.confirmed_by ?? null,
    confirmed_at: row.confirmed_at ?? null,
    rejected_by: row.rejected_by ?? null,
    rejected_at: row.rejected_at ?? null,
    applied_at: row.applied_at ?? null,
    error: row.error ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    confirm_card: confirmCard(row),
    workspace_panel: workspacePanel(row),
  };
}
