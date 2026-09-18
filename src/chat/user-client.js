/**
 * User-JWT Supabase client for chat tools (RLS applies).
 * Never accepts or forwards a service-role key.
 */
import { createClient } from '@supabase/supabase-js';
import { assertAllowedSupabaseUrl } from '../config/supabase-lock.js';
import {
  assertNoServiceRoleEnv,
  assertNotServiceRoleClient,
  createChatToolEnv,
} from '../security/service-role-guard.js';

/**
 * @param {string} userJwt
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {typeof createClient} createClientImpl
 */
export function createUserScopedClient(
  userJwt,
  env = process.env,
  createClientImpl = createClient
) {
  if (!userJwt || typeof userJwt !== 'string' || !userJwt.trim()) {
    throw new Error('Chat tools require a user JWT. Service-role must never substitute for the user.');
  }

  const isolatedEnv = createChatToolEnv(env);
  assertNoServiceRoleEnv(isolatedEnv);

  const { url } = assertAllowedSupabaseUrl(isolatedEnv.SUPABASE_URL);
  const anonKey = isolatedEnv.SUPABASE_ANON_KEY;
  if (!anonKey || /replace-with|placeholder|changeme/i.test(anonKey)) {
    throw new Error('SUPABASE_ANON_KEY is required for user-scoped chat clients.');
  }

  const client = createClientImpl(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${userJwt.trim()}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  assertNotServiceRoleClient(client);
  return client;
}
