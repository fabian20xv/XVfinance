#!/usr/bin/env node
/**
 * E1 schema/RLS smoke against the locked XVfinance Supabase project only.
 */
import { ALLOWED_SUPABASE_URL } from '../src/config/supabase-lock.js';
import { runE1Smoke } from '../src/server/dev-seed.js';

try {
  const result = await runE1Smoke(process.env);
  console.log(`E1 smoke OK on ${ALLOWED_SUPABASE_URL}: ${JSON.stringify(result)}`);
} catch (err) {
  console.error(`XVfinance E1 smoke aborted: ${err.message}`);
  process.exitCode = 1;
}
