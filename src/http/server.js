/**
 * Minimal HTTP API for Tess staging health/smoke.
 *
 * Does not import or expose the service-role key. Smoke uses a user-JWT client (RLS).
 */
import { createServer } from 'node:http';
import { boot } from '../config/startup.js';
import { resolveAppEnv, resolveCommitSha, isProductionEnv } from '../config/runtime-env.js';
import { authorizeSmokeRequest, runSmoke } from './smoke.js';

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function healthBody(env, locked) {
  return {
    ok: true,
    commit: resolveCommitSha(env),
    env: resolveAppEnv(env),
    supabaseRef: locked.ref,
  };
}

function drain(req) {
  return new Promise((resolve, reject) => {
    req.on('data', () => {});
    req.on('end', resolve);
    req.on('error', reject);
  });
}

/**
 * @param {object} options
 * @param {NodeJS.ProcessEnv} options.env
 * @param {{ ref: string, url: string, host: string, role: string }} options.locked
 * @param {(jwt: string, env: Record<string, string | undefined>) => object} [options.createUserClient]
 */
export function createRequestHandler({ env, locked, createUserClient } = {}) {
  return async function handleRequest(req, res) {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const path = url.pathname;

      if (path === '/api/health' && req.method === 'GET') {
        sendJson(res, 200, healthBody(env, locked));
        return;
      }

      if (path === '/api/health') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' });
        return;
      }

      if (path === '/api/smoke' && req.method === 'POST') {
        await drain(req);

        if (isProductionEnv(env)) {
          sendJson(res, 403, { ok: false, error: 'smoke is disabled in production' });
          return;
        }

        const auth = authorizeSmokeRequest(req, env);
        if (!auth.ok) {
          sendJson(res, auth.status, { ok: false, error: auth.error });
          return;
        }

        const result = await runSmoke({ env, createUserClient });
        sendJson(res, result.ok ? 200 : 503, {
          ok: result.ok,
          env: resolveAppEnv(env),
          supabaseRef: result.supabaseRef ?? locked.ref,
          steps: result.steps,
        });
        return;
      }

      if (path === '/api/smoke') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' });
        return;
      }

      sendJson(res, 404, { ok: false, error: 'not found' });
    } catch {
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: 'internal error' });
      }
    }
  };
}

/**
 * @param {object} options
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {{ ref: string, url: string, host: string, role: string }} [options.locked]
 * @param {(jwt: string, env: Record<string, string | undefined>) => object} [options.createUserClient]
 */
export function createHttpServer(options = {}) {
  const env = options.env ?? process.env;
  const locked = options.locked ?? boot(env);
  return createServer(createRequestHandler({ ...options, env, locked }));
}

/**
 * Boot the allowlist lock, then listen. PORT defaults to 3000 (use 0 in tests).
 * @param {NodeJS.ProcessEnv} env
 * @param {{ createUserClient?: Function }} [options]
 */
export async function startHttpServer(env = process.env, options = {}) {
  const locked = boot(env);
  const server = createHttpServer({
    env,
    locked,
    createUserClient: options.createUserClient,
  });
  const port = env.PORT != null && String(env.PORT).trim() !== '' ? Number(env.PORT) : 3000;

  await new Promise((resolve, reject) => {
    const onError = (err) => {
      server.close();
      reject(err);
    };
    server.once('error', onError);
    server.listen(port, () => {
      server.off('error', onError);
      resolve();
    });
  });

  const address = server.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;
  return { server, port: boundPort, locked };
}
