#!/usr/bin/env node
/**
 * Tess QA fixture seed for the develop Supabase project only.
 * Refuses parent/prod (krcwpupbdizzjyydzaqp). Service-role stays server-side.
 *
 * Usage:
 *   SUPABASE_URL=https://bkwhqfkosxnoffpsjcug.supabase.co npm run seed:tess
 *   npm run seed:tess -- --dry-run
 */
import { runTessDevelopSeed } from '../src/server/tess-seed.js';

try {
  const result = await runTessDevelopSeed(process.env, { argv: process.argv });
  if (result.dry_run) {
    console.log(
      `Tess develop seed dry-run OK — would write fixtures to ${result.project_url} ` +
        `(ref ${result.project_ref}). Parent is forbidden.`
    );
    console.log(
      `Inventory: ${result.inventory.tenants.length} tenants, ` +
        `${result.inventory.users.length} firm members, ` +
        `${result.inventory.top_10_jobs.length} top jobs.`
    );
  } else {
    console.log(
      `Tess develop seed OK — firms ${result.alpha_firm_id}, ${result.beta_firm_id} ` +
        `on ${result.project_url} (ref ${result.project_ref})`
    );
  }
} catch (err) {
  console.error(`XVfinance Tess develop seed aborted: ${err.message}`);
  process.exitCode = 1;
}
