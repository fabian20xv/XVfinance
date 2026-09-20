#!/usr/bin/env node
/**
 * E5–E8 schema smoke against the locked XVfinance Supabase project only.
 */
import { ALLOWED_SUPABASE_URL } from '../src/config/supabase-lock.js';
import { runE5E8Smoke } from '../src/server/dev-seed.js';

try {
  const result = await runE5E8Smoke(process.env);
  console.log(`E5–E8 smoke OK on ${ALLOWED_SUPABASE_URL}: ${JSON.stringify(result)}`);
} catch (err) {
  console.error(`XVfinance E5–E8 smoke aborted: ${err.message}`);
  process.exitCode = 1;
}
