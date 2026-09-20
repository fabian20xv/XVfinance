/**
 * Finish a successful tool dispatch: attach audit_id, never 500 after a
 * committed proposal confirm/reject mutate (BUG-2).
 */

export const PROPOSAL_LIFECYCLE_ACTIONS = Object.freeze([
  'proposal.confirmed',
  'proposal.applied',
  'proposal.rejected',
  'proposal.failed',
]);

/**
 * @param {string | undefined} action
 */
export function isProposalLifecycleAction(action) {
  return typeof action === 'string' && PROPOSAL_LIFECYCLE_ACTIONS.includes(action);
}

/**
 * @param {object} options
 * @param {{ ok: true, data: unknown, audit?: { action?: string, entityTable?: string, entityId?: string, sensitive?: boolean, id?: string } }} options.result
 * @param {{ userId: string, firmId: string, role: string }} options.session
 * @param {Function} options.writeAudit
 * @param {NodeJS.ProcessEnv} [options.env]
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function completeToolSuccess({ result, session, writeAudit, env }) {
  const audit = result.audit;
  if (!audit?.action) {
    return { status: 200, body: { ok: true, data: result.data } };
  }

  if (audit.id) {
    return { status: 200, body: { ok: true, data: result.data, audit_id: audit.id } };
  }

  try {
    const auditId = await writeAudit({
      env,
      firmId: session.firmId,
      actorId: session.userId,
      action: audit.action,
      entityTable: audit.entityTable,
      entityId: audit.entityId ?? session.userId,
      payload: {
        tool: audit.action,
        role: session.role,
        entity_id: audit.entityId ?? null,
        sensitive: Boolean(audit.sensitive),
      },
    });
    return {
      status: 200,
      body: { ok: true, data: result.data, ...(auditId ? { audit_id: auditId } : {}) },
    };
  } catch (err) {
    // HTTP cannot share a transaction with the user-JWT UPDATE. Prefer the
    // DB trigger for fail-closed integrity. If a lifecycle mutate already
    // committed, never return 500 — Tess/clients treat that as failure.
    if (isProposalLifecycleAction(audit.action)) {
      return { status: 200, body: { ok: true, data: result.data } };
    }
    throw err;
  }
}
