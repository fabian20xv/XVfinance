/**
 * audit_events.entity_id is uuid. Never persist ticker symbols or other non-UUIDs.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function asAuditEntityId(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }
  return UUID_RE.test(text) ? text : null;
}
