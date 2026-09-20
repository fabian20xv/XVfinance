import { SCRATCHPAD_UI, SCRATCHPAD_WATERMARK } from '../scratchpad/contract.js';
import { MOTION } from './tokens.js';

export { SCRATCHPAD_UI, SCRATCHPAD_WATERMARK };

export const SCRATCHPAD_EXIT_MS = MOTION.scratchpadDissolveMs;

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
    id: null,
    overlay: null,
    persisted: false,
    source_of_truth: false,
    live: false,
  };
}
