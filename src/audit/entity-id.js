/**
 * audit_events.entity_id is uuid. Never persist ticker symbols or other non-UUIDs.
 *
 * Market quote/fundamentals/news (BUG-B10): prefer a real instruments.id, else a
 * stable RFC 4122 UUID v5 in a fixed namespace, else the nil UUID.
 */
import { createHash } from 'node:crypto';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC 4122 nil UUID — valid uuid, used when no instrument/namespace name exists. */
export const AUDIT_NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** RFC 4122 URL namespace (for UUID v5). */
export const UUID_NAMESPACE_URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

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

/**
 * Coerce for audit_events.entity_id: keep valid UUIDs, keep explicit null,
 * map non-UUID junk (tickers) to the nil UUID so Postgres never sees "SPY".
 * @param {unknown} value
 * @returns {string | null}
 */
export function coerceAuditEntityId(value) {
  if (value == null || value === '') {
    return null;
  }
  return asAuditEntityId(value) ?? AUDIT_NIL_UUID;
}

/**
 * @param {string} namespaceUuid
 * @param {string} name
 * @returns {string}
 */
export function uuidV5(namespaceUuid, name) {
  const nsHex = String(namespaceUuid).replace(/-/g, '');
  const ns = Buffer.from(nsHex, 'hex');
  const hash = createHash('sha1').update(ns).update(String(name)).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Stable entity_id for market-tool audits (instruments table).
 * @param {{ instrumentId?: unknown, symbol?: unknown }} [options]
 * @returns {string}
 */
export function marketInstrumentEntityId({ instrumentId, symbol } = {}) {
  const real = asAuditEntityId(instrumentId);
  if (real) {
    return real;
  }
  const ticker = String(symbol ?? '')
    .trim()
    .toUpperCase();
  if (!ticker) {
    return AUDIT_NIL_UUID;
  }
  return uuidV5(UUID_NAMESPACE_URL, `https://xvfinance.invalid/instruments/${ticker}`);
}
