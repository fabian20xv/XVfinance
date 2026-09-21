/**
 * Node HTTP API: JWT session + tool router + audit writer + proposals + Tess health/smoke.
 */
import { createServer } from 'node:http';
import { createUserScopedClient } from '../chat/user-client.js';
import { boot } from '../config/startup.js';
import { isProductionEnv, resolveAppEnv, resolveCommitSha } from '../config/runtime-env.js';
import { dispatchTool } from '../chat/tool-router.js';
import { writeAuditEvent } from './audit.js';
import { handleV1Chat } from './chat-http.js';
import { ApiError } from './errors.js';
import { completeToolSuccess } from './tool-response.js';
import { bearerTokenFromHeader, verifySupabaseAccessToken } from './jwt.js';
import { attachFirmContext } from './session.js';
import { authorizeSmokeRequest, runSmoke } from './smoke.js';

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const PROPOSAL_PATH = new RegExp(
  `^/v1/proposals(?:/(${UUID})(?:/(confirm|reject|confirm-card|workspace-panel))?)?$`
);
const REPORT_EXPORT_PATH = new RegExp(`^/v1/reports/(${UUID})/export$`);
const REPORT_RECEIPTS_PATH = new RegExp(`^/v1/reports/(${UUID})/receipts$`);
const MEETING_EXPORT_PATH = new RegExp(`^/v1/reports/(${UUID})/meeting-export$`);
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
  not_sent: 409,
  unauthenticated: 401,
  invalid_args: 400,
  openai_api_key_missing: 503,
  openai_timeout: 504,
  openai_spend_limit: 429,
  openai_error: 503,
  confirm_on_write: 409,
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
  const locked = deps.locked ?? boot(env);
  const resolved = {
    env,
    locked,
    verifyToken: deps.verifyToken ?? verifySupabaseAccessToken,
    attachSession: deps.attachSession ?? attachFirmContext,
    dispatch: deps.dispatch ?? dispatchTool,
    writeAudit: deps.writeAudit ?? writeAuditEvent,
    createUserClient: deps.createUserClient ?? createUserScopedClient,
    chatProvider: deps.chatProvider,
  };

  return async function listener(req, res) {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const path = url.pathname.replace(/\/+$/, '') || '/';

      if (req.method === 'GET' && path === '/api/health') {
        send(res, 200, {
          ok: true,
          commit: resolveCommitSha(resolved.env),
          env: resolveAppEnv(resolved.env),
          supabaseRef: resolved.locked.ref,
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/smoke') {
        for await (const chunk of req) {
          void chunk;
        }

        if (isProductionEnv(resolved.env)) {
          send(res, 403, { ok: false, error: 'smoke is disabled in production' });
          return;
        }

        const auth = authorizeSmokeRequest(req, resolved.env);
        if (!auth.ok) {
          send(res, auth.status, { ok: false, error: auth.error });
          return;
        }

        const result = await runSmoke({
          env: resolved.env,
          createUserClient: resolved.createUserClient,
        });
        send(res, result.ok ? 200 : 503, {
          ok: result.ok,
          env: resolveAppEnv(resolved.env),
          supabaseRef: result.supabaseRef ?? resolved.locked.ref,
          steps: result.steps,
        });
        return;
      }

      if (req.method === 'GET' && path === '/health') {
        send(res, 200, {
          ok: true,
          data: {
            status: 'ok',
            project_ref: resolved.locked.ref,
            supabase_url: resolved.locked.url,
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

      const reportReceipts = path.match(REPORT_RECEIPTS_PATH);
      if (reportReceipts && req.method === 'GET') {
        await runTool(req, res, resolved, 'get_meeting_receipts', {
          report_id: reportReceipts[1],
        });
        return;
      }

      const meetingExport = path.match(MEETING_EXPORT_PATH);
      if (meetingExport && req.method === 'GET') {
        await runTool(req, res, resolved, 'export_meeting_one_pager', {
          report_id: meetingExport[1],
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

      if (req.method === 'POST' && path === '/v1/chat') {
        const { token, session } = await authenticate(req, resolved);
        const body = await readJsonBody(req);
        await handleV1Chat({
          req,
          res,
          body,
          token,
          session,
          deps: resolved,
          send,
        });
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

  const completed = await completeToolSuccess({
    result,
    session,
    writeAudit: deps.writeAudit,
    env: deps.env,
  });
  send(res, completed.status, completed.body);
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
