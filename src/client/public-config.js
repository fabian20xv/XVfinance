/**
 * Browser / client-bundle public config.
 * Only an allowlisted project URL and the anon/publishable key may appear here.
 */
import { ALLOWED_SUPABASE_URL, assertAllowedSupabaseUrl } from '../config/supabase-lock.js';
import { assertNoServiceRoleEnv, createChatToolEnv } from '../security/service-role-guard.js';

/**
 * @param {Record<string, string | undefined>} env
 */
export function getPublicSupabaseConfig(env = {}) {
  const publicEnv = createChatToolEnv(env);
  assertNoServiceRoleEnv(publicEnv);

  const url = publicEnv.SUPABASE_URL ?? ALLOWED_SUPABASE_URL;
  const locked = assertAllowedSupabaseUrl(url);

  return Object.freeze({
    url: locked.url,
    anonKey: publicEnv.SUPABASE_ANON_KEY ?? publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
