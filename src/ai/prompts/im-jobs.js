/**
 * Top-10 investment-manager jobs brief. Aligned with Tess TESS_TOP_10_JOBS
 * and docs/tess-develop-seed.md (product jobs, not QA fixture IDs).
 */
import { TESS_TOP_10_JOBS } from '../../db/tess-ids.js';

export const TOP_10_IM_JOBS = TESS_TOP_10_JOBS;

/**
 * @param {typeof TESS_TOP_10_JOBS} [jobs]
 */
export function formatImJobsBrief(jobs = TOP_10_IM_JOBS) {
  const lines = jobs.map((row) => {
    const tools = row.tools?.length ? row.tools.join(', ') : 'RLS read (no chat tool)';
    return `${row.id}. ${row.job} — tools: ${tools}`;
  });
  return `Top-10 IM jobs (use allowlisted tools; do not invent writes):
${lines.join('\n')}
Also in-product (same allowlist): quotes/fundamentals/news, notes + draft reports, CSV holdings import, impact scratchpad, meeting ghostwriter + receipts.`;
}
