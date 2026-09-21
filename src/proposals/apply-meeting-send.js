/**
 * Apply a confirmed meeting_send payload onto reports (in-memory / test mirror of
 * private.apply_meeting_send). Live confirm still runs in the proposals trigger.
 */

const CHANNELS = new Set(['email', 'export']);

/**
 * @param {object} options
 * @param {object} options.proposal
 * @param {object[]} [options.reports]
 * @param {() => string} [options.now]
 * @returns {{ ok: true, applied_at: string } | { ok: false, error: string }}
 */
export function applyMeetingSend({ proposal, reports = [], now = () => new Date().toISOString() }) {
  const payload = proposal?.payload && typeof proposal.payload === 'object' ? proposal.payload : {};
  const reportId = payload.report_id;
  if (!reportId) {
    return { ok: false, error: 'meeting_send requires report_id' };
  }

  const channel = payload.channel || 'export';
  if (!CHANNELS.has(channel)) {
    return { ok: false, error: 'meeting_send channel must be email or export' };
  }

  const receipts = payload.receipts;
  if (!Array.isArray(receipts) || receipts.length < 1) {
    return { ok: false, error: 'meeting_send requires at least one receipt' };
  }

  const report = reports.find((row) => row.id === reportId && row.firm_id === proposal.firm_id);
  const reportReceipts = Array.isArray(report?.receipts) ? report.receipts : [];
  if (
    !report ||
    report.purpose !== 'meeting_one_pager' ||
    report.status !== 'draft' ||
    reportReceipts.length < 1
  ) {
    return {
      ok: false,
      error: `draft meeting 1-pager ${reportId} not found or missing receipts`,
    };
  }

  const appliedAt = now();
  report.status = 'published';
  report.published_at = report.published_at ?? appliedAt;
  report.sent_at = appliedAt;
  report.send_channel = channel;
  return { ok: true, applied_at: appliedAt };
}

/**
 * Fail-closed confirm apply for meeting_send (same outcome as proposals_before_write).
 * Other kinds are left as the requested confirmed row (DB trigger applies them).
 * @param {object} db
 * @param {object} previous
 * @param {object} next
 */
export function applyConfirmedProposal(db, previous, next) {
  if (previous.kind !== 'meeting_send') {
    return next;
  }

  const result = applyMeetingSend({
    proposal: { ...previous, ...next },
    reports: db.reports ?? [],
  });

  if (!result.ok) {
    return {
      ...next,
      status: 'failed',
      error: result.error,
    };
  }

  return {
    ...next,
    status: 'applied',
    applied_at: result.applied_at,
    error: null,
  };
}
