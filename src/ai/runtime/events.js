/**
 * Streaming-friendly chat events. SSE uses `event: <type>` + JSON data.
 * JSON mode returns the same objects in an `events` array.
 */

export const CHAT_EVENT_TYPES = Object.freeze([
  'started',
  'text_delta',
  'tool_call',
  'tool_result',
  'proposal',
  'error',
  'done',
]);

/**
 * @param {string} type
 * @param {unknown} data
 * @param {string} [at]
 */
export function chatEvent(type, data, at = new Date().toISOString()) {
  return { type, data, at };
}

/**
 * @param {string} type
 * @param {unknown} data
 */
export function formatSse(type, data) {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Pull confirm-on-write UI contracts out of a tool payload (same proposal_id).
 * @param {unknown} data
 * @returns {null | { proposal_id: string, confirm_card?: object, workspace_panel?: object, status?: string }}
 */
export function extractProposalPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }
  const row = data;
  const card =
    row.confirm_card && typeof row.confirm_card === 'object'
      ? row.confirm_card
      : row.ui === 'chat.confirm_card'
        ? row
        : null;
  const panel =
    row.workspace_panel && typeof row.workspace_panel === 'object'
      ? row.workspace_panel
      : row.ui === 'workspace.diff_confirm_panel'
        ? row
        : null;
  const proposalId =
    card?.proposal_id ?? panel?.proposal_id ?? (typeof row.proposal_id === 'string' ? row.proposal_id : null);
  if (!proposalId) {
    return null;
  }
  if (!card && !panel) {
    return null;
  }
  return {
    proposal_id: proposalId,
    confirm_card: card ?? undefined,
    workspace_panel: panel ?? undefined,
    status: card?.status ?? panel?.status ?? row.status,
  };
}
