/**
 * Vercel Function adapter around createRequestListener.
 *
 * Routing and allowlist stay in the E0 HTTP listener. This file only:
 * - exports a Node (req, res) handler for /api
 * - restores the public path when vercel.json rewrites onto /api
 */
import { createRequestListener } from './http.js';

function header(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) {
    return value[0];
  }
  return typeof value === 'string' ? value : undefined;
}

/**
 * Public URL path+query as createRequestListener should see it.
 * @param {import('node:http').IncomingMessage} req
 */
export function publicRequestUrl(req) {
  const raw = req.url || '/';
  let url;
  try {
    url = new URL(raw, 'http://127.0.0.1');
  } catch {
    return raw;
  }

  const xvPath = url.searchParams.get('xv_path');
  if (typeof xvPath === 'string' && xvPath.startsWith('/')) {
    url.searchParams.delete('xv_path');
    return xvPath + url.search;
  }

  const path = url.pathname.replace(/\/+$/, '') || '/';
  const forwarded = header(req, 'x-forwarded-uri');
  if (forwarded && (path === '/api' || path === '/')) {
    return forwarded;
  }

  return raw;
}

/**
 * @param {Parameters<typeof createRequestListener>[0]} [options]
 * @returns {import('node:http').RequestListener}
 */
export function createVercelAdapter(options) {
  const listener = createRequestListener(options);
  return function vercelAdapter(req, res) {
    const nextUrl = publicRequestUrl(req);
    if (nextUrl !== req.url) {
      req.url = nextUrl;
    }
    return listener(req, res);
  };
}
