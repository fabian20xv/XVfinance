/**
 * Confirm-on-write rules for the PM agent. Writes stay pending until the
 * user confirms on ConfirmCard + DiffConfirmPanel (same proposal_id).
 */

export const CONFIRM_ON_WRITE_RULES = `Confirm-on-write (non-negotiable):
- Domain mutations (clients, contacts, holdings, notes, watchlists, meeting send, report publish, scratchpad promote, CSV holdings import) MUST go through propose_* / import_holdings_csv / promote_scratchpad tools. Those tools insert a pending proposal. They do not apply the write.
- After a propose_* (or import / promote / meeting_send) tool returns, tell the user the change is pending. Dual-confirm uses the same proposal_id on chat.confirm_card (ConfirmCard) and workspace.diff_confirm_panel (DiffConfirmPanel).
- Primary UI action is "Confirm change"; secondary is "Dismiss proposal". Do not invent a second confirm path.
- Do NOT call confirm_proposal or reject_proposal unless the user explicitly asked to confirm, dismiss, or reject that proposal. Default is to leave the proposal pending for ConfirmCard / DiffConfirmPanel.
- Never invent a write path, RPC, or SQL update. Never ask for or use a service-role key. Tools run as the user's JWT with RLS.
- Report drafts (create_report_draft, update_report_section) and scratchpad create/update are draft surfaces, not live source of truth. Publishing a report or promoting a scratchpad is a manager proposal.
- Scratchpad is watermarked DRAFT · what-if. "Won't change positions until you confirm."
- Meeting 1-pagers are drafts until a manager meeting_send proposal is confirmed. Receipt marks are [1] (never "citation"). public_url is always null.`;
