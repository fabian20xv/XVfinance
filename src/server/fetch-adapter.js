/**
 * Fetch (Web Request/Response) adapter around createRequestListener.
 * Lets the Next.js App Router serve the same E0 /v1 HTTP API without forking routes.
 */
import { Readable } from 'node:stream';
import { createRequestListener } from './http.js';

function headerMap(request) {
  const headers = Object.create(null);
  for (const [key, value] of request.headers.entries()) {
    headers[key.toLowerCase()] = value;
  }
  return headers;
}

/**
 * @param {Parameters<typeof createRequestListener>[0]} [options]
 * @returns {(request: Request) => Promise<Response>}
 */
export function createFetchHandler(options) {
  const listener = createRequestListener(options);

  return async function fetchHandler(request) {
    const url = new URL(request.url);
    const pathWithQuery = `${url.pathname}${url.search}`;
    const method = request.method || 'GET';
    let bodyBuf = Buffer.alloc(0);
    if (method !== 'GET' && method !== 'HEAD') {
      const ab = await request.arrayBuffer();
      bodyBuf = Buffer.from(ab);
    }

    const req = Readable.from(bodyBuf.length ? [bodyBuf] : []);
    req.method = method;
    req.url = pathWithQuery;
    req.headers = headerMap(request);

    return new Promise((resolve, reject) => {
      let status = 200;
      const headers = {};
      let ended = false;

      const res = {
        writeHead(code, hdrs) {
          status = code;
          if (hdrs && typeof hdrs === 'object') {
            for (const [key, value] of Object.entries(hdrs)) {
              headers[key] = value;
            }
          }
        },
        setHeader(key, value) {
          headers[key] = value;
        },
        end(payload) {
          if (ended) {
            return;
          }
          ended = true;
          const body = payload == null ? null : payload;
          resolve(new Response(body, { status, headers }));
        },
      };

      Promise.resolve(listener(req, res)).catch((err) => {
        if (!ended) {
          reject(err);
        }
      });
    });
  };
}

let cached;

/**
 * Lazy so `boot()` runs with runtime env, not at Next.js build analysis.
 * @param {Parameters<typeof createRequestListener>[0]} [options]
 */
export function getFetchHandler(options) {
  if (options) {
    return createFetchHandler(options);
  }
  cached ??= createFetchHandler();
  return cached;
}
