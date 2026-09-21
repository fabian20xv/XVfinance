import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getPublicSupabaseConfig } from '@/src/client/public-config.js';

export async function createServerSupabase() {
  const cfg = getPublicSupabaseConfig(process.env);
  if (!cfg.anonKey) {
    throw new Error(
      'SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required. Service-role must never substitute.'
    );
  }
  const cookieStore = await cookies();
  return createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, _headers) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Components cannot set cookies. There is no Edge/root middleware;
          // AuthGate refreshes the session in the browser.
        }
      },
    },
  });
}
