import { assertAllowedSupabaseUrl, ALLOWED_SUPABASE_URL } from './supabase-lock.js';

/**
 * Process boot guard: require SUPABASE_URL and refuse any other project.
 * @param {NodeJS.ProcessEnv} env
 */
export function boot(env = process.env) {
  if (!env.SUPABASE_URL) {
    throw new Error(
      'SUPABASE_URL is required at startup. Copy .env.example to .env. ' +
        `Only ${ALLOWED_SUPABASE_URL} (ref krcwpupbdizzjyydzaqp) is allowed.`
    );
  }

  return assertAllowedSupabaseUrl(env.SUPABASE_URL);
}
