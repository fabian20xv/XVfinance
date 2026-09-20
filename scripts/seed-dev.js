#!/usr/bin/env node
/**
 * Dev seed for the locked XVfinance Supabase project only.
 */
import { ALLOWED_SUPABASE_URL } from '../src/config/supabase-lock.js';
import { runDevSeed } from '../src/server/dev-seed.js';

try {
  const result = await runDevSeed(process.env);
  console.log(`Seed OK — firm ${result.firm_id} on ${ALLOWED_SUPABASE_URL}`);
} catch (err) {
  console.error(`XVfinance seed aborted: ${err.message}`);
  process.exitCode = 1;
}
