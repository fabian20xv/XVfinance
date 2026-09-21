import { SCRATCHPAD_UI, SCRATCHPAD_WATERMARK } from '../scratchpad/contract.js';
import { MOTION } from './tokens.js';

export { SCRATCHPAD_UI, SCRATCHPAD_WATERMARK };

export const SCRATCHPAD_EXIT_MS = MOTION.scratchpadDissolveMs;

/** UI-only phrase. Backend watermark contract stays SCRATCHPAD_WATERMARK. */
export const SCRATCHPAD_WATERMARK_DISPLAY = 'DRAFT · what-if';
export const SCRATCHPAD_WATERMARK_SUBLINE = "Won't change positions until you confirm.";
export const SCRATCHPAD_FAIL_TOAST = 'Not applied — still draft.';
export const WATERMARK_OPACITY = 0.1;

/**
 * Overlay contract: veil over live workspace, not a tab.
 * @param {object} [row]
 */
export function scratchpadOverlay(row = {}) {
  return {
    ui: SCRATCHPAD_UI,
    watermark: row.watermark || SCRATCHPAD_WATERMARK,
    source_of_truth: false,
    live: false,
    id: row.id ?? null,
    as_of: row.as_of ?? row.updated_at ?? null,
    impact: row.impact ?? null,
  };
}

/**
 * Discard / exit without promote: no source-of-truth persistence.
 */
export function discardedScratchpadState() {
  return {
    open: false,
    dissolving: false,
    success: false,
    id: null,
    overlay: null,
    persisted: false,
    source_of_truth: false,
    live: false,
  };
}

/**
 * as-of chip: "as of HH:MM · pf·xxxx"
 * @param {string | null | undefined} asOf
 * @param {string | null | undefined} portfolioId
 */
export function formatAsOfChip(asOf, portfolioId) {
  const date = asOf ? new Date(asOf) : new Date();
  const hh = Number.isNaN(date.getTime())
    ? '--:--'
    : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  const pf = portfolioId ? `pf·${String(portfolioId).slice(0, 4)}` : 'pf·—';
  return `as of ${hh} · ${pf}`;
}
