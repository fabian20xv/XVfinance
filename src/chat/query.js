import { ToolError } from './tool-error.js';

export const PAGE_MAX = 100;
export const PAGE_DEFAULT = 20;

/**
 * @param {{ limit?: number, offset?: number }} args
 */
export function pagination(args = {}) {
  const limitRaw = args.limit ?? PAGE_DEFAULT;
  const offsetRaw = args.offset ?? 0;
  const limit = Math.min(Math.max(1, Number.parseInt(String(limitRaw), 10) || PAGE_DEFAULT), PAGE_MAX);
  const offset = Math.max(0, Number.parseInt(String(offsetRaw), 10) || 0);
  return { limit, offset };
}

/**
 * Fetch limit+1 rows so callers can set has_more without a count query.
 * @param {object} builder supabase query builder
 * @param {number} limit
 * @param {number} offset
 */
export function applyRange(builder, limit, offset) {
  return builder.range(offset, offset + limit);
}

/**
 * @template T
 * @param {{ data: T, error: { message?: string, code?: string } | null }} result
 * @param {string} fallback
 * @returns {T}
 */
export function unwrap(result, fallback = 'Query failed') {
  if (result?.error) {
    const code = result.error.code === 'PGRST116' ? 'not_found' : 'tool_failed';
    throw new ToolError(code, result.error.message || fallback);
  }
  return result.data;
}

/**
 * @template T
 * @param {T[]} rows
 * @param {number} limit
 */
export function pageResult(rows, limit, offset) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, limit, offset, has_more: hasMore };
}

export function excerpt(text, max = 80) {
  if (text == null) {
    return '';
  }
  const trimmed = String(text).replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1)}…`;
}

export function asNumber(value) {
  if (value == null || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}
