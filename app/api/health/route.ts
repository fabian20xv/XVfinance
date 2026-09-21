import { getFetchHandler } from '@/src/server/fetch-adapter.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return getFetchHandler()(request);
}
