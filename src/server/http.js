/**
 * Node HTTP API: JWT session + tool router + audit writer.
 */
import { createServer } from 'node:http';
import { ALLOWED_SUPABASE_PROJECT_REF, ALLOWED_SUPABASE_URL } from '../config/supabase-lock.js';
import { dispatchTool } from '../chat/tool-router.js';
import { writeAuditEvent } from './audit.js';
import { ApiError } from './errors.js';
import { bearerTokenFromHeader, verifySupabaseAccessToken } from './jwt.js';
import { attachFirmContext } from './session.js';

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function sendError(res, err) {
  if (err instanceof ApiError) {
    send(res, err.status, { ok: false, error: err.toJSON() });
    return;
  }
  send(res, 500, { ok: false, error: { code: 'internal', message: err.message } });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body must be JSON.');
  }
}

async function authenticate(req, deps) {
  const token = bearerTokenFromHeader(req.headers.authorization);
  const verified = await deps.verifyToken(token, { env: deps.env });
  const preferredFirmId = req.headers['x-firm-id'] || undefined;
  const session = await deps.attachSession({
    userId: verified.userId,
    userJwt: token,
    preferredFirmId,
    env: deps.env,
  });
  return { token, session };
}

/**
 * @param {object} [options]
 */
export function createRequestListener({ env = process.env, deps = {} } = {}) {
  const resolved = {
    env,
    verifyToken: deps.verifyToken ?? verifySupabaseAccessToken,
    attachSession: deps.attachSession ?? attachFirmContext,
    dispatch: deps.dispatch ?? dispatchTool,
    writeAudit: deps.writeAudit ?? writeAuditEvent,
  };

  return async function listener(req, res) {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const path = url.pathname.replace(/\/+$/, '') || '/';

      if (req.method === 'GET' && path === '/health') {
        send(res, 200, {
          ok: true,
          data: {
            status: 'ok',
            project_ref: ALLOWED_SUPABASE_PROJECT_REF,
            supabase_url: ALLOWED_SUPABASE_URL,
          },
        });
        return;
      }

      if (req.method === 'GET' && path === '/v1/session') {
        const { token, session } = await authenticate(req, resolved);
        const result = await resolved.dispatch({
          name: 'get_session',
          args: {},
          session,
          userJwt: token,
          env: resolved.env,
        });
        await finishTool(res, result, session, resolved);
        return;
      }

      if (req.method === 'POST' && path === '/v1/tools') {
        const { token, session } = await authenticate(req, resolved);
        const body = await readJsonBody(req);
        if (!body?.name || typeof body.name !== 'string') {
          send(res, 400, {
            ok: false,
            error: { code: 'invalid_args', message: 'JSON body must include a tool name.' },
          });
          return;
        }
        const result = await resolved.dispatch({
          name: body.name,
          args: body.args ?? {},
          session,
          userJwt: token,
          env: resolved.env,
        });
        await finishTool(res, result, session, resolved);
        return;
      }

      send(res, 404, { ok: false, error: { code: 'not_found', message: 'Not found' } });
    } catch (err) {
      sendError(res, err);
    }
  };
}

async function finishTool(res, result, session, deps) {
  if (!result.ok) {
    const status =
      result.error?.code === 'unknown_tool'
        ? 404
        : result.error?.code === 'tool_failed'
          ? 500
          : 400;
    send(res, status, { ok: false, error: result.error });
    return;
  }

  let auditId;
  if (result.audit?.action) {
    auditId = await deps.writeAudit({
      env: deps.env,
      firmId: session.firmId,
      actorId: session.userId,
      action: result.audit.action,
      entityTable: result.audit.entityTable,
      entityId: result.audit.entityId ?? session.userId,
      payload: {
        tool: result.audit.action,
        role: session.role,
        data: result.data,
      },
    });
  }

  send(res, 200, { ok: true, data: result.data, ...(auditId ? { audit_id: auditId } : {}) });
}

/**
 * @param {object} [options]
 * @returns {Promise<import('node:http').Server>}
 */
export function startApiServer({ port = 0, host = '127.0.0.1', env = process.env, deps } = {}) {
  const server = createServer(createRequestListener({ env, deps }));
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}
