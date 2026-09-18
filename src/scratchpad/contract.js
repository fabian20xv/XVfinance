/**
 * CA-8 Impact Scratchpad UI contract. Watermarked; never source of truth.
 */

export const SCRATCHPAD_WATERMARK = 'SCRATCHPAD — not live / not source of truth';
export const SCRATCHPAD_UI = 'workspace.impact_scratchpad';

/**
 * @param {object} row
 * @param {Record<string, unknown>} [extras]
 */
export function scratchpadPayload(row, extras = {}) {
  return {
    ui: SCRATCHPAD_UI,
    watermark: row?.watermark || SCRATCHPAD_WATERMARK,
    source_of_truth: false,
    live: false,
    id: row?.id ?? null,
    firm_id: row?.firm_id ?? null,
    portfolio_id: row?.portfolio_id ?? null,
    name: row?.name ?? null,
    scenario: row?.scenario ?? {},
    created_by: row?.created_by ?? null,
    created_at: row?.created_at ?? null,
    updated_at: row?.updated_at ?? null,
    ...extras,
  };
}
