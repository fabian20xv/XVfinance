import {
  assertAllowedSupabaseUrl,
  describeAllowedSupabaseProjects,
  DEVELOP_SUPABASE_PROJECT_REF,
  PARENT_SUPABASE_PROJECT,
} from './supabase-lock.js';
import { isProductionEnv } from './runtime-env.js';

/**
 * Process boot guard: require SUPABASE_URL and refuse any project outside the allowlist.
 * Develop/staging ref is refused when APP_ENV/VERCEL_ENV is production.
 * @param {NodeJS.ProcessEnv} env
 */
export function boot(env = process.env) {
  if (!env.SUPABASE_URL) {
    throw new Error(
      'SUPABASE_URL is required at startup. Copy .env.example to .env. ' +
        `Only ${describeAllowedSupabaseProjects()} are allowed.`
    );
  }

  const locked = assertAllowedSupabaseUrl(env.SUPABASE_URL);

  if (isProductionEnv(env) && locked.ref === DEVELOP_SUPABASE_PROJECT_REF) {
    throw new Error(
      `Refused develop/staging Supabase ref "${locked.ref}" because APP_ENV/VERCEL_ENV is production. ` +
        `Production may only use parent ref ${PARENT_SUPABASE_PROJECT.ref} (${PARENT_SUPABASE_PROJECT.url}).`
    );
  }

  return locked;
}
