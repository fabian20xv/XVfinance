import { createBrowserClient } from '@supabase/ssr';
import { getPublicSupabaseConfig } from '@/src/client/public-config.js';

export function createBrowserSupabase() {
  const cfg = getPublicSupabaseConfig({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!cfg.anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY is required for AuthGate. Use the locked project anon/publishable key only.'
    );
  }
  return createBrowserClient(cfg.url, cfg.anonKey);
}
