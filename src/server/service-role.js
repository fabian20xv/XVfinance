/**
 * Locked-down server path for the Supabase service-role key.
 *
 * Import only from trusted server modules (admin, migrations, audit writers).
 * Never import this from src/chat or src/client — lint and tests forbid it.
 */
import { createClient } from '@supabase/supabase-js';
import { assertAllowedSupabaseUrl } from '../config/supabase-lock.js';
import { markServiceRoleClient } from '../security/service-role-guard.js';

function isPlaceholder(value) {
  if (!value) {
    return true;
  }
  return /replace-with|your-service-role|changeme|placeholder/i.test(value);
}

/**
 * Read the service-role key. Server-only.
 * @param {NodeJS.ProcessEnv} env
 * @returns {string}
 */
export function getServiceRoleKey(env = process.env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (isPlaceholder(key)) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is missing or still a placeholder. ' +
        'Set it only on the server; never in chat tools or client bundles.'
    );
  }
  return key;
}

/**
 * Privileged Supabase client. Bypasses RLS — server paths only.
 * @param {NodeJS.ProcessEnv} env
 * @param {typeof createClient} createClientImpl
 */
export function createServiceRoleClient(env = process.env, createClientImpl = createClient) {
  const { url } = assertAllowedSupabaseUrl(env.SUPABASE_URL);
  const key = getServiceRoleKey(env);
  const client = createClientImpl(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return markServiceRoleClient(client);
}
