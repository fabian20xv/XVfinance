/**
 * Confirm-on-write policy for the E11 agent.
 *
 * confirm_proposal / reject_proposal stay on the E2 HTTP allowlist for the
 * ConfirmCard. The model must not call them — writes stay
 * propose → ConfirmCard → confirm/reject.
 */

export const AGENT_CONFIRM_BLOCKED_TOOLS = Object.freeze(['confirm_proposal', 'reject_proposal']);

export const CONFIRM_ON_WRITE_CODE = 'confirm_on_write';

export const CONFIRM_ON_WRITE_MESSAGE =
  'Writes stay propose → ConfirmCard → confirm/reject. The agent cannot confirm or reject proposals. Ask the user to click Confirm change or Dismiss proposal.';

/**
 * @param {string} name
 */
export function isConfirmOnWriteBlocked(name) {
  return AGENT_CONFIRM_BLOCKED_TOOLS.includes(name);
}
