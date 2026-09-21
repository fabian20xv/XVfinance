/**
 * OpenAI-primary agent turn loop with allowlisted tool calling.
 * Confirm-on-write: propose_* stays pending until ConfirmCard / DiffConfirmPanel.
 */
import { parseComposerInput } from '../../web/parse-composer.js';
import { buildSystemPrompt } from '../prompts/index.js';
import {
  dispatchAllowlistedTool,
  openaiToolsFromAllowlist,
  TOOL_ALLOWLIST,
} from '../tools/index.js';
import { chatEvent, extractProposalPayload } from './events.js';
import { ModelUnavailableError } from './openai.js';
import { abortAfter, DEFAULT_TIMEOUTS, withTimeout } from './timeouts.js';

const MAX_TOOL_RESULT_CHARS = 24_000;
const CONFIRM_TOOLS = new Set(['confirm_proposal', 'reject_proposal']);
const EXPLICIT_CONFIRM_RE = /\b(confirm|dismiss|reject|apply this|go ahead)\b/i;

/**
 * @param {string} name
 * @param {string} [userText]
 */
export function agentMayConfirm(name, userText) {
  if (!CONFIRM_TOOLS.has(name)) {
    return true;
  }
  return EXPLICIT_CONFIRM_RE.test(String(userText || ''));
}

function truncateJson(value) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  if (raw.length <= MAX_TOOL_RESULT_CHARS) {
    return raw;
  }
  return `${raw.slice(0, MAX_TOOL_RESULT_CHARS)}…[truncated]`;
}

function asUserText(messages, fallback) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const row = messages[i];
    if (row?.role === 'user' && typeof row.content === 'string' && row.content.trim()) {
      return row.content;
    }
  }
  return fallback;
}

function toOpenAIHistory(messages) {
  const out = [];
  for (const row of messages ?? []) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const role = row.role;
    const content = typeof row.content === 'string' ? row.content : row.text;
    if ((role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim()) {
      out.push({ role, content });
    }
  }
  return out;
}

function parseToolArgs(raw) {
  if (raw == null || raw === '') {
    return {};
  }
  if (typeof raw === 'object') {
    return raw;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * @param {object} options
 */
export async function runChatTurn({
  message,
  messages = [],
  session,
  userJwt,
  env = process.env,
  dispatch,
  provider,
  tools = TOOL_ALLOWLIST,
  onEvent = () => {},
  timeouts = DEFAULT_TIMEOUTS,
  now = () => Date.now(),
} = {}) {
  const events = [];
  const toolCalls = [];
  const proposals = [];
  const startedAt = now();

  const emit = (type, data) => {
    const event = chatEvent(type, data, new Date(now()).toISOString());
    events.push(event);
    onEvent(event);
    return event;
  };

  const elapsed = () => now() - startedAt;
  const remainingTurn = () => Math.max(1, (timeouts.turnMs ?? DEFAULT_TIMEOUTS.turnMs) - elapsed());

  const history = toOpenAIHistory(messages);
  const userText = String(message ?? asUserText(history, '')).trim();
  if (!userText) {
    emit('error', { code: 'invalid_args', message: 'Chat turn requires a user message.' });
    emit('done', { ok: false, finish_reason: 'invalid_args' });
    return {
      ok: false,
      error: { code: 'invalid_args', message: 'Chat turn requires a user message.' },
      events,
      tool_calls: toolCalls,
      proposals,
      message: '',
      finish_reason: 'invalid_args',
    };
  }

  emit('started', { message: userText });

  const parsed = parseComposerInput(userText);
  if (parsed.type === 'invalid_json') {
    emit('error', { code: 'invalid_args', message: parsed.message });
    emit('done', { ok: false, finish_reason: 'invalid_args' });
    return {
      ok: false,
      error: { code: 'invalid_args', message: parsed.message },
      events,
      tool_calls: toolCalls,
      proposals,
      message: parsed.message,
      finish_reason: 'invalid_args',
    };
  }

  const runOneTool = async (name, args, origin) => {
    if (!agentMayConfirm(name, userText)) {
      const blocked = {
        ok: false,
        error: {
          code: 'confirm_required',
          message:
            'Writes stay pending until ConfirmCard / DiffConfirmPanel (same proposal_id). Do not auto-confirm.',
        },
      };
      emit('tool_call', { name, args, origin });
      emit('tool_result', { name, ok: false, error: blocked.error, origin });
      toolCalls.push({ name, args, ok: false, error: blocked.error, origin });
      return blocked;
    }

    emit('tool_call', { name, args, origin });
    let result;
    try {
      result = await withTimeout(
        dispatchAllowlistedTool({
          name,
          args,
          session,
          userJwt,
          env,
          tools,
          dispatch,
        }),
        timeouts.toolMs ?? DEFAULT_TIMEOUTS.toolMs,
        `tool ${name}`
      );
    } catch (err) {
      result = {
        ok: false,
        error: { code: err.code || 'timeout', message: err.message },
      };
    }

    const proposal = result.ok ? extractProposalPayload(result.data) : null;
    if (proposal) {
      proposals.push(proposal);
      emit('proposal', proposal);
    }
    emit('tool_result', {
      name,
      ok: result.ok,
      data: result.ok ? result.data : undefined,
      error: result.ok ? undefined : result.error,
      proposal_id: proposal?.proposal_id,
      origin,
    });
    toolCalls.push({
      name,
      args,
      ok: result.ok,
      error: result.ok ? undefined : result.error,
      proposal_id: proposal?.proposal_id,
      origin,
    });
    return result;
  };

  if (parsed.type === 'tool') {
    const result = await runOneTool(parsed.name, parsed.args, 'composer');
    const text = result.ok
      ? truncateJson(result.data)
      : result.error?.message ?? 'Tool failed';
    emit('text_delta', { text });
    emit('done', {
      ok: result.ok,
      finish_reason: result.ok ? 'tool' : result.error?.code ?? 'tool_failed',
      message: text,
      tool_calls: toolCalls,
      proposals,
    });
    return {
      ok: result.ok,
      error: result.ok ? undefined : result.error,
      events,
      tool_calls: toolCalls,
      proposals,
      message: text,
      data: result.ok ? result.data : undefined,
      finish_reason: result.ok ? 'tool' : result.error?.code ?? 'tool_failed',
    };
  }

  if (!provider || typeof provider.complete !== 'function') {
    const err = new ModelUnavailableError(
      'OPENAI_API_KEY is not set. Natural-language agent turns are unavailable; slash/JSON tools still work via the E2 allowlist.'
    );
    emit('error', { code: err.code, message: err.message });
    emit('done', { ok: false, finish_reason: err.code });
    return {
      ok: false,
      error: { code: err.code, message: err.message },
      events,
      tool_calls: toolCalls,
      proposals,
      message: err.message,
      finish_reason: err.code,
    };
  }

  const openaiTools = openaiToolsFromAllowlist(tools);
  const llmMessages = [
    { role: 'system', content: buildSystemPrompt() },
    ...history.filter((row) => row.content !== userText),
    { role: 'user', content: userText },
  ];

  let finishReason = 'stop';
  let assistantText = '';

  try {
    for (let round = 0; round < (timeouts.maxToolRounds ?? DEFAULT_TIMEOUTS.maxToolRounds); round += 1) {
      if (elapsed() >= (timeouts.turnMs ?? DEFAULT_TIMEOUTS.turnMs)) {
        const err = new Error('Agent turn timed out');
        err.code = 'timeout';
        throw err;
      }
      const controller = abortAfter(Math.min(timeouts.providerMs ?? DEFAULT_TIMEOUTS.providerMs, remainingTurn()));
      const completion = await withTimeout(
        provider.complete(
          {
            messages: llmMessages,
            tools: openaiTools,
          },
          controller.signal
        ),
        timeouts.providerMs ?? DEFAULT_TIMEOUTS.providerMs,
        'openai complete'
      );

      const msg = completion.message ?? {};
      const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
      finishReason = completion.finish_reason ?? (calls.length ? 'tool_calls' : 'stop');

      if (calls.length > 0) {
        llmMessages.push({
          role: 'assistant',
          content: msg.content ?? null,
          tool_calls: calls,
        });
        for (const call of calls) {
          const name = call.function?.name || call.name;
          const args = parseToolArgs(call.function?.arguments ?? call.arguments);
          const result = await runOneTool(name, args, 'model');
          llmMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: truncateJson(result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }),
          });
        }
        continue;
      }

      assistantText = typeof msg.content === 'string' ? msg.content : '';
      if (assistantText) {
        emit('text_delta', { text: assistantText });
      }
      finishReason = 'stop';
      emit('done', {
        ok: true,
        finish_reason: finishReason,
        message: assistantText,
        tool_calls: toolCalls,
        proposals,
      });
      return {
        ok: true,
        events,
        tool_calls: toolCalls,
        proposals,
        message: assistantText,
        finish_reason: finishReason,
      };
    }

    finishReason = 'max_tool_rounds';
    assistantText = 'Stopped after the maximum number of tool rounds. Confirm any pending proposal in ConfirmCard.';
    emit('text_delta', { text: assistantText });
    emit('done', {
      ok: true,
      finish_reason: finishReason,
      message: assistantText,
      tool_calls: toolCalls,
      proposals,
    });
    return {
      ok: true,
      events,
      tool_calls: toolCalls,
      proposals,
      message: assistantText,
      finish_reason: finishReason,
    };
  } catch (err) {
    const code =
      err instanceof ModelUnavailableError ? err.code : err.code === 'timeout' ? 'timeout' : 'tool_failed';
    const message = err.message || 'Agent turn failed';
    emit('error', { code, message });
    emit('done', { ok: false, finish_reason: code, message });
    return {
      ok: false,
      error: { code, message },
      events,
      tool_calls: toolCalls,
      proposals,
      message,
      finish_reason: code,
    };
  }
}
