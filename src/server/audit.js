/**
 * Firm-scoped audit writer. Server-only (service-role); never imported from chat tools.
 */
import { asAuditEntityId } from '../audit/entity-id.js';
import { createServiceRoleClient } from './service-role.js';
import { badRequest } from './errors.js';

const SENSITIVE_KEY = /^(authorization|password|secret|token|jwt|service[_-]?role|apikey)$/i;

/**
 * @param {unknown} value
 * @returns {unknown}
 */
export function redactAuditPayload(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactAuditPayload(item));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redactAuditPayload(nested);
    }
    return out;
  }
  return value;
}

/**
 * @param {object} event
 * @param {string} event.firmId
 * @param {string} [event.actorId]
 * @param {string} event.action
 * @param {string} [event.entityTable]
 * @param {string} [event.entityId]
 * @param {Record<string, unknown>} [event.payload]
 * @param {NodeJS.ProcessEnv} [event.env]
 * @param {Function} [event.createAdmin]
 * @returns {Promise<string>} audit_events.id
 */
export async function writeAuditEvent({
  firmId,
  actorId,
  action,
  entityTable,
  entityId,
  payload,
  env = process.env,
  createAdmin = createServiceRoleClient,
}) {
  if (!firmId) {
    throw badRequest('audit_events.firm_id is required.', 'audit_firm_required');
  }
  if (!action || typeof action !== 'string') {
    throw badRequest('audit_events.action is required.', 'audit_action_required');
  }

  const admin = createAdmin(env);
  const { data, error } = await admin
    .from('audit_events')
    .insert({
      firm_id: firmId,
      actor_id: actorId ?? null,
      action,
      entity_table: entityTable ?? null,
      entity_id: asAuditEntityId(entityId),
      payload: redactAuditPayload(payload ?? {}),
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`audit write failed: ${error.message}`);
  }
  if (!data?.id) {
    throw new Error('audit write failed: missing id');
  }
  return data.id;
}

/**
 * Proposal lifecycle actions (E4 will emit these; wired here so the writer is ready).
 * @param {'draft_created' | 'submitted' | 'confirmed' | 'rejected' | 'applied' | 'failed'} event
 */
export function proposalAuditAction(event) {
  return `proposal.${event}`;
}
