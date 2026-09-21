/**
 * Fetch (Web Request/Response) adapter around createRequestListener.
 * Lets the Next.js App Router serve the same E0 /v1 HTTP API without forking routes.
 * Supports buffered JSON (writeHead + end) and SSE (writeHead + write + end).
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

function encodeChunk(chunk) {
  if (chunk == null) {
    return new Uint8Array();
  }
  if (typeof chunk === 'string') {
    return new TextEncoder().encode(chunk);
  }
  if (chunk instanceof Uint8Array) {
    return chunk;
  }
  return Buffer.from(chunk);
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
      let resolved = false;
      let streamController = null;

      function ensureStream() {
        if (resolved) {
          return;
        }
        resolved = true;
        const stream = new ReadableStream({
          start(controller) {
            streamController = controller;
          },
        });
        resolve(new Response(stream, { status, headers }));
      }

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
        write(chunk) {
          if (ended) {
            return false;
          }
          ensureStream();
          streamController.enqueue(encodeChunk(chunk));
          return true;
        },
        end(payload) {
          if (ended) {
            return;
          }
          ended = true;
          if (!resolved) {
            resolved = true;
            const body = payload == null ? null : payload;
            resolve(new Response(body, { status, headers }));
            return;
          }
          if (payload != null && payload !== '') {
            streamController.enqueue(encodeChunk(payload));
          }
          streamController.close();
        },
      };

      Promise.resolve(listener(req, res)).catch((err) => {
        if (!ended && !resolved) {
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
