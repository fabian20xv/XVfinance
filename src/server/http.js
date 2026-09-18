/**
 * Node HTTP API: JWT session + tool router + audit writer + proposals.
 */
import { createServer } from 'node:http';
import { ALLOWED_SUPABASE_PROJECT_REF, ALLOWED_SUPABASE_URL } from '../config/supabase-lock.js';
import { dispatchTool } from '../chat/tool-router.js';
import { writeAuditEvent } from './audit.js';
import { ApiError } from './errors.js';
import { bearerTokenFromHeader, verifySupabaseAccessToken } from './jwt.js';
import { attachFirmContext } from './session.js';

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const PROPOSAL_PATH = new RegExp(
  `^/v1/proposals(?:/(${UUID})(?:/(confirm|reject|confirm-card|workspace-panel))?)?$`
);
const REPORT_EXPORT_PATH = new RegExp(`^/v1/reports/(${UUID})/export$`);
const SCRATCHPAD_IMPACT_PATH = new RegExp(`^/v1/scratchpads/(${UUID})/impact$`);

const ERROR_STATUS = {
  unknown_tool: 404,
  not_found: 404,
  tool_failed: 500,
  forbidden: 403,
  role_required: 403,
  expired: 409,
  conflict: 409,
  apply_failed: 409,
  unmatched_symbols: 409,
  not_published: 409,
  unauthenticated: 401,
  invalid_args: 400,
};

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

function intQuery(url, name) {
  const raw = url.searchParams.get(name);
  if (raw == null || raw === '') {
    return undefined;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

async function runTool(req, res, deps, name, args) {
  const { token, session } = await authenticate(req, deps);
  const result = await deps.dispatch({
    name,
    args,
    session,
    userJwt: token,
    env: deps.env,
  });
  await finishTool(res, result, session, deps);
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
        await runTool(req, res, resolved, 'get_session', {});
        return;
      }

      const proposalMatch = path.match(PROPOSAL_PATH);
      if (proposalMatch) {
        const proposalId = proposalMatch[1];
        const action = proposalMatch[2];

        if (!proposalId && req.method === 'GET') {
          const args = {
            status: url.searchParams.get('status') || undefined,
            kind: url.searchParams.get('kind') || undefined,
            limit: intQuery(url, 'limit'),
            offset: intQuery(url, 'offset'),
          };
          if (args.limit == null) {
            delete args.limit;
          }
          if (args.offset == null) {
            delete args.offset;
          }
          if (!args.status) {
            delete args.status;
          }
          if (!args.kind) {
            delete args.kind;
          }
          await runTool(req, res, resolved, 'list_proposals', args);
          return;
        }

        if (proposalId && !action && req.method === 'GET') {
          await runTool(req, res, resolved, 'get_proposal', { proposal_id: proposalId });
          return;
        }

        if (proposalId && action === 'confirm-card' && req.method === 'GET') {
          await runTool(req, res, resolved, 'get_proposal_confirm_card', {
            proposal_id: proposalId,
          });
          return;
        }

        if (proposalId && action === 'workspace-panel' && req.method === 'GET') {
          await runTool(req, res, resolved, 'get_proposal_workspace_panel', {
            proposal_id: proposalId,
          });
          return;
        }

        if (proposalId && action === 'confirm' && req.method === 'POST') {
          await runTool(req, res, resolved, 'confirm_proposal', { proposal_id: proposalId });
          return;
        }

        if (proposalId && action === 'reject' && req.method === 'POST') {
          await runTool(req, res, resolved, 'reject_proposal', { proposal_id: proposalId });
          return;
        }
      }

      const reportExport = path.match(REPORT_EXPORT_PATH);
      if (reportExport && req.method === 'GET') {
        await runTool(req, res, resolved, 'export_published_report', {
          report_id: reportExport[1],
        });
        return;
      }

      const scratchpadImpact = path.match(SCRATCHPAD_IMPACT_PATH);
      if (scratchpadImpact && req.method === 'GET') {
        await runTool(req, res, resolved, 'get_scratchpad_impact', {
          scratchpad_id: scratchpadImpact[1],
        });
        return;
      }

      if (req.method === 'POST' && path === '/v1/imports/holdings') {
        const body = await readJsonBody(req);
        await runTool(req, res, resolved, 'import_holdings_csv', body);
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
    const status = ERROR_STATUS[result.error?.code] ?? 400;
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
        entity_id: result.audit.entityId ?? null,
        sensitive: Boolean(result.audit.sensitive),
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
