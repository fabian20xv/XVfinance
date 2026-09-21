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
 * Keys read by name from public/runtime env. Never enumerate `process.env` —
 * Vercel Edge `process.env` is not a plain object (`Object.entries` can throw).
 * Service-role / server secrets are intentionally absent from this list.
 */
export const PUBLIC_SUPABASE_ENV_KEYS = Object.freeze([
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'APP_ENV',
  'VERCEL_ENV',
]);

function readEnvValue(env, key) {
  try {
    const value = env?.[key];
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  } catch {
    return undefined;
  }
}

/**
 * Copy only public/runtime keys via named access. Blank strings count as unset.
 * Safe to pass `process.env` even when it is not enumerable.
 * @param {Record<string, string | undefined>} env
 */
export function pickPublicSupabaseEnv(env = {}) {
  const picked = Object.create(null);
  for (const key of PUBLIC_SUPABASE_ENV_KEYS) {
    const value = readEnvValue(env, key);
    if (value !== undefined) {
      picked[key] = value;
    }
  }
  return Object.freeze(picked);
}

/**
 * Resolve the public Supabase URL from Next.js or Node env.
 * Preview/dev may use develop; production must use parent. Never a third ref.
 * @param {Record<string, string | undefined>} env
 */
export function resolvePublicSupabaseUrl(env = {}) {
  const publicEnv = createChatToolEnv(pickPublicSupabaseEnv(env));
  const url =
    publicEnv.NEXT_PUBLIC_SUPABASE_URL ??
    publicEnv.SUPABASE_URL ??
    ALLOWED_SUPABASE_URL;
  const locked = assertAllowedSupabaseUrl(url);

  if (isProductionEnv(publicEnv) && locked.ref === DEVELOP_SUPABASE_PROJECT_REF) {
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
  const publicEnv = createChatToolEnv(pickPublicSupabaseEnv(env));
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

/**
 * Never throws. Incomplete or refused public config returns ok:false.
 * Error text is lock messages only — no secrets.
 * @param {Record<string, string | undefined>} env
 */
export function tryGetPublicSupabaseConfig(env = {}) {
  try {
    return { ok: true, config: getPublicSupabaseConfig(env), error: null };
  } catch (error) {
    return {
      ok: false,
      config: null,
      error: error instanceof Error ? error.message : 'public supabase config failed',
    };
  }
}
