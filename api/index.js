/**
 * Vercel serverless entry. Preview/Production invoke this Function;
 * local `npm start` still runs `src/index.js --serve`.
 *
 * Listener is created on first request so `boot()` runs with runtime env
 * (SUPABASE_URL), not at module evaluation during a Vercel build.
 */
import { createVercelAdapter } from '../src/server/vercel-adapter.js';

let adapter;

export default function vercelHandler(req, res) {
  adapter ??= createVercelAdapter();
  return adapter(req, res);
}
