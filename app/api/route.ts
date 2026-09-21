import { getFetchHandler } from '@/src/server/fetch-adapter.js';
import { restoreXvPath } from '@/src/server/fetch-xv-path.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request) {
  return getFetchHandler()(restoreXvPath(request));
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
