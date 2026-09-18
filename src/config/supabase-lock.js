/**
 * Single source of truth for the only allowed Supabase project.
 * Never point this repo at any other project.
 */
export const ALLOWED_SUPABASE_PROJECT_REF = 'krcwpupbdizzjyydzaqp';
export const ALLOWED_SUPABASE_HOST = `${ALLOWED_SUPABASE_PROJECT_REF}.supabase.co`;
export const ALLOWED_SUPABASE_URL = `https://${ALLOWED_SUPABASE_HOST}`;
export const ALLOWED_JWT_ISSUER = `${ALLOWED_SUPABASE_URL}/auth/v1`;

function fail(message) {
  const error = new Error(message);
  error.name = 'SupabaseProjectLockError';
  throw error;
}

/**
 * Extract the Supabase project ref from a URL host (`{ref}.supabase.co`).
 * @param {string} urlString
 * @returns {string}
 */
export function parseSupabaseProjectRef(urlString) {
  if (urlString == null || String(urlString).trim() === '') {
    fail(
      'SUPABASE_URL is required. Only ' +
        `${ALLOWED_SUPABASE_URL} (ref ${ALLOWED_SUPABASE_PROJECT_REF}) is allowed.`
    );
  }

  const trimmed = String(urlString).trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    fail(`SUPABASE_URL is not a valid URL: ${trimmed}`);
  }

  if (parsed.protocol !== 'https:') {
    fail(`SUPABASE_URL must use https, got "${parsed.protocol}" (${trimmed}).`);
  }

  const host = parsed.hostname.toLowerCase();
  const match = host.match(/^([a-z0-9]+)\.supabase\.co$/);
  if (!match) {
    fail(
      `SUPABASE_URL host must be {project-ref}.supabase.co, got "${parsed.hostname}". ` +
        `Only ${ALLOWED_SUPABASE_HOST} (ref ${ALLOWED_SUPABASE_PROJECT_REF}) is allowed.`
    );
  }

  return match[1];
}

/**
 * Fail loud unless SUPABASE_URL is exactly the locked XVfinance project.
 * @param {string} urlString
 * @returns {{ ref: string, url: string, host: string }}
 */
export function assertAllowedSupabaseUrl(urlString) {
  const ref = parseSupabaseProjectRef(urlString);
  const parsed = new URL(String(urlString).trim());

  if (ref !== ALLOWED_SUPABASE_PROJECT_REF) {
    fail(
      `Refused Supabase project ref "${ref}". ` +
        `Only ${ALLOWED_SUPABASE_PROJECT_REF} is allowed (${ALLOWED_SUPABASE_URL}).`
    );
  }

  if (parsed.hostname.toLowerCase() !== ALLOWED_SUPABASE_HOST) {
    fail(
      `Refused Supabase host "${parsed.hostname}". ` +
        `Only ${ALLOWED_SUPABASE_HOST} is allowed.`
    );
  }

  if (parsed.origin.toLowerCase() !== ALLOWED_SUPABASE_URL) {
    fail(
      `Refused Supabase origin "${parsed.origin}". ` +
        `Only ${ALLOWED_SUPABASE_URL} is allowed.`
    );
  }

  return {
    ref: ALLOWED_SUPABASE_PROJECT_REF,
    host: ALLOWED_SUPABASE_HOST,
    url: ALLOWED_SUPABASE_URL,
  };
}
