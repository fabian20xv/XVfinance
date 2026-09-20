/**
 * Catch-all so /api/health and /api/smoke are this Function, not a missing
 * api/health.js 404. Same listener as api/index.js.
 */
export { default } from './index.js';
