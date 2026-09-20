#!/usr/bin/env node
/**
 * E9 meeting ghostwriter smoke against the locked XVfinance Supabase project only.
 */
import { ALLOWED_SUPABASE_URL } from '../src/config/supabase-lock.js';
import { runE9Smoke } from '../src/server/dev-seed.js';

try {
  const result = await runE9Smoke(process.env);
  console.log(`E9 smoke OK on ${ALLOWED_SUPABASE_URL}: ${JSON.stringify(result)}`);
} catch (err) {
  console.error(`XVfinance E9 smoke aborted: ${err.message}`);
  process.exitCode = 1;
}
