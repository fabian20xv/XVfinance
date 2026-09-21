import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge-only pass-through.
 *
 * Do not import `@supabase/ssr`, `src/client/public-config`, or other app
 * modules from this file. Those graphs evaluate in the Vercel Edge isolate
 * *before* `middleware()` runs, so try/catch cannot catch them. Production
 * `/` after PR #12 still returned 500 MIDDLEWARE_INVOCATION_FAILED while
 * matcher-excluded `/api/health` was 200 — proof the handler fail-open
 * never ran.
 *
 * Session refresh stays on the Node/browser paths:
 * `lib/supabase/server.ts` (Auth callback) and AuthGate (`createBrowserSupabase`).
 * Reintroduce cookie refresh here only with a next/server-only, named-env
 * module — never the full supabase-js Edge bundle (WebSocket/phoenix/web3).
 */
export function middleware(request: NextRequest) {
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|v1/|health$|api/).*)',
  ],
};
