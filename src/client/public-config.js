/**
 * Browser / client-bundle public config.
 * Only an allowlisted project URL and the anon/publishable key may appear here.
 */
import { isProductionEnv } from '../config/runtime-env.js';
import {
  ALLOWED_SUPABASE_URL,
  DEVELOP_SUPABASE_PROJECT_REF,
  PARENT_SUPABASE_PROJECT,
  assertAllowedSupabaseUrl,
} from '../config/supabase-lock.js';
import { assertNoServiceRoleEnv, createChatToolEnv } from '../security/service-role-guard.js';

/**
 * Resolve the public Supabase URL from Next.js or Node env.
 * Preview/dev may use develop; production must use parent. Never a third ref.
 * @param {Record<string, string | undefined>} env
 */
export function resolvePublicSupabaseUrl(env = {}) {
  const publicEnv = createChatToolEnv(env);
  const url =
    publicEnv.NEXT_PUBLIC_SUPABASE_URL ??
    publicEnv.SUPABASE_URL ??
    ALLOWED_SUPABASE_URL;
  const locked = assertAllowedSupabaseUrl(url);

  if (isProductionEnv(env) && locked.ref === DEVELOP_SUPABASE_PROJECT_REF) {
    throw new Error(
      `Refused develop/staging Supabase ref "${locked.ref}" because APP_ENV/VERCEL_ENV is production. ` +
        `Production may only use parent ref ${PARENT_SUPABASE_PROJECT.ref} (${PARENT_SUPABASE_PROJECT.url}).`
    );
  }

  return locked;
}

/**
 * @param {Record<string, string | undefined>} env
 */
export function getPublicSupabaseConfig(env = {}) {
  const publicEnv = createChatToolEnv(env);
  assertNoServiceRoleEnv(publicEnv);

  const locked = resolvePublicSupabaseUrl(env);

  return Object.freeze({
    url: locked.url,
    ref: locked.ref,
    role: locked.role,
    anonKey:
      publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      publicEnv.SUPABASE_ANON_KEY ??
      publicEnv.SUPABASE_PUBLISHABLE_KEY,
  });
}
