/**
 * POST /v1/ai/chat — OpenAI-primary agent turn on the E0 listener (RFC-011).
 * Auth is the same bearer user JWT as POST /v1/tools.
 */
import { runChatTurn, assertChatProviderReady } from '../ai/runtime/turn.js';
import { ChatRuntimeError } from '../ai/runtime/errors.js';
import { completeToolSuccess } from './tool-response.js';

export function wantsChatStream(req, body) {
  if (body && body.stream === false) {
    return false;
  }
  if (body && body.stream === true) {
    return true;
  }
  const accept = String(req.headers?.accept || '');
  if (accept.includes('text/event-stream')) {
    return true;
  }
  if (accept.includes('application/json')) {
    return false;
  }
  return true;
}

export function writeSse(res, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  res.write(payload);
}

function startSse(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.flushHeaders?.();
}

/**
 * @param {object} options
 */
export async function handleV1Chat({ req, res, body, token, session, deps, send }) {
  try {
    assertChatProviderReady({ env: deps.env, provider: deps.chatProvider });
  } catch (err) {
    if (err instanceof ChatRuntimeError) {
      send(res, err.status, { ok: false, error: err.toJSON() });
      return;
    }
    throw err;
  }

  const stream = wantsChatStream(req, body);
  let headersSent = false;

  // Open SSE before the model call so fetch() receives headers immediately.
  // Waiting until the first delta/tool event delays TTFB until OpenAI returns,
  // which looks like a hung composer on Vercel Preview.
  if (stream) {
    startSse(res);
    headersSent = true;
    writeSse(res, 'started', { ok: true });
  }

  const dispatch = async (params) => {
    const result = await deps.dispatch({
      ...params,
      session: params.session ?? session,
      userJwt: params.userJwt ?? token,
      env: params.env ?? deps.env,
    });
    if (!result.ok) {
      return result;
    }
    const completed = await completeToolSuccess({
      result,
      session,
      writeAudit: deps.writeAudit,
      env: deps.env,
    });
    return { ...result, audit_id: completed.body.audit_id };
  };

  const emit = (event) => {
    if (!stream) {
      return;
    }
    if (!headersSent) {
      startSse(res);
      headersSent = true;
    }
    writeSse(res, event.event, event.data);
  };

  try {
    const done = await runChatTurn({
      messages: body?.messages,
      session,
      userJwt: token,
      env: deps.env,
      dispatch,
      provider: deps.chatProvider,
      emit,
    });
    if (stream) {
      if (!headersSent) {
        startSse(res);
        headersSent = true;
        writeSse(res, 'done', done);
      }
      res.end();
      return;
    }
    send(res, 200, { ok: true, data: done });
  } catch (err) {
    const error =
      err instanceof ChatRuntimeError
        ? err
        : new ChatRuntimeError('openai_error', err.message || 'Chat turn failed.', 500);
    if (stream && headersSent) {
      writeSse(res, 'error', { ok: false, error: error.toJSON() });
      res.end();
      return;
    }
    send(res, error.status, { ok: false, error: error.toJSON() });
  }
}
