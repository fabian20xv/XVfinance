/**
 * Restore vercel.json `xv_path` rewrites onto a Fetch Request
 * so Next.js `/api` can reuse createRequestListener.
 */
export function restoreXvPath(request) {
  const url = new URL(request.url);
  const xvPath = url.searchParams.get('xv_path');
  if (typeof xvPath !== 'string' || !xvPath.startsWith('/')) {
    return request;
  }
  url.searchParams.delete('xv_path');
  const target = new URL(xvPath + url.search, url.origin);
  const method = request.method || 'GET';
  const init = {
    method,
    headers: request.headers,
  };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }
  return new Request(target, init);
}
