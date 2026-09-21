import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { tryGetPublicSupabaseConfig } from '@/src/client/public-config.js';

/**
 * Refresh the Supabase Auth session on the Next.js 15 middleware path.
 * Next.js 16 renamed this file to proxy.ts — keep middleware.ts while on 15.
 *
 * Must never throw: an uncaught error here becomes Vercel
 * 500 MIDDLEWARE_INVOCATION_FAILED for every matched page (including `/`).
 * Incomplete/refused public config or getClaims() failures fail-open so the
 * App Router shell / AuthGate can still render. Secrets are never logged.
 */
export async function updateSession(
  request: NextRequest,
  deps: {
    env?: Record<string, string | undefined>;
    createClient?: typeof createServerClient;
  } = {},
) {
  try {
    const resolved = tryGetPublicSupabaseConfig(deps.env ?? process.env);
    if (!resolved.ok || !resolved.config?.anonKey) {
      if (!resolved.ok) {
        console.error(`XVfinance middleware: ${resolved.error}`);
      }
      return NextResponse.next({ request });
    }

    const cfg = resolved.config;
    let supabaseResponse = NextResponse.next({ request });
    const createClient = deps.createClient ?? createServerClient;

    const supabase = createClient(cfg.url, cfg.anonKey, {
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
          if (headers && typeof headers === 'object') {
            Object.entries(headers).forEach(([key, value]) => {
              if (typeof value === 'string') {
                supabaseResponse.headers.set(key, value);
              }
            });
          }
        },
      },
    });

    await supabase.auth.getClaims();
    return supabaseResponse;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'session refresh failed';
    console.error(`XVfinance middleware: ${detail}`);
    return NextResponse.next({ request });
  }
}
