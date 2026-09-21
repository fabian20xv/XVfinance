/**
 * Confirm-role defaults per proposal kind.
 * Notes: any_member (analyst or manager). Do not force manager-only for notes.
 */
export const CONFIRM_ROLES = Object.freeze(['any_member', 'manager']);

export const DEFAULT_REQUIRES_ROLE = Object.freeze({
  note_upsert: 'any_member',
  client_upsert: 'manager',
  contact_upsert: 'manager',
  holding_changes: 'manager',
  portfolio_upsert: 'manager',
  watchlist_upsert: 'manager',
  report_publish: 'manager',
  holdings_import: 'manager',
  scratchpad_promote: 'manager',
  meeting_send: 'manager',
});

export const PROPOSAL_KINDS = Object.freeze(Object.keys(DEFAULT_REQUIRES_ROLE));

export const API_STATUSES = Object.freeze(['pending', 'confirmed', 'rejected', 'expired', 'failed', 'draft']);

/**
 * @param {string} kind
 * @returns {'any_member' | 'manager'}
 */
export function requiresRoleForKind(kind) {
  return DEFAULT_REQUIRES_ROLE[kind] ?? 'manager';
}

/**
 * Map DB proposal_status (+ expires_at) to the CA-4.1 API status.
 * @param {{ status: string, expires_at?: string | null }} row
 */
export function apiStatus(row) {
  if (!row) {
    return null;
  }
  if (
    row.status === 'pending_confirm' &&
    row.expires_at &&
    Date.parse(row.expires_at) < Date.now()
  ) {
    return 'expired';
  }
  if (row.status === 'pending_confirm') {
    return 'pending';
  }
  if (row.status === 'confirmed' || row.status === 'applied') {
    return 'confirmed';
  }
  return row.status;
}

/**
 * @param {string} api
 * @returns {string[]}
 */
export function dbStatusesForApi(api) {
  switch (api) {
    case 'pending':
      return ['pending_confirm'];
    case 'confirmed':
      return ['confirmed', 'applied'];
    case 'rejected':
      return ['rejected'];
    case 'expired':
      return ['expired', 'pending_confirm'];
    case 'failed':
      return ['failed'];
    case 'draft':
      return ['draft'];
    default:
      return null;
  }
}

/**
 * @param {string} role
 * @param {'any_member' | 'manager'} requiresRole
 */
export function roleCanConfirm(role, requiresRole) {
  if (requiresRole === 'manager') {
    return role === 'manager';
  }
  return role === 'manager' || role === 'analyst';
}

/**
 * Any firm member may dismiss/reject. Confirm/apply stay on roleCanConfirm.
 * @param {string} role
 */
export function roleCanReject(role) {
  return role === 'manager' || role === 'analyst';
}
