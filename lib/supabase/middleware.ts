import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getPublicSupabaseConfig } from '@/src/client/public-config.js';

/**
 * Refresh the Supabase Auth session on the Next.js 15 middleware path.
 * Next.js 16 renamed this file to proxy.ts — keep middleware.ts while on 15.
 */
export async function updateSession(request: NextRequest) {
  const cfg = getPublicSupabaseConfig(process.env);
  if (!cfg.anonKey) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
        if (headers) {
          Object.entries(headers).forEach(([key, value]) => {
            supabaseResponse.headers.set(key, value);
          });
        }
      },
    },
  });

  await supabase.auth.getClaims();
  return supabaseResponse;
}
