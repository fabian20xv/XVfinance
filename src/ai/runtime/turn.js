/**
 * OpenAI-primary agent turn: messages → model+tools → allowlisted execute → reply.
 * Chat path never imports service-role. Tool execution is user JWT + RLS.
 */
import { createChatToolEnv, assertNoServiceRoleEnv } from '../../security/service-role-guard.js';
import { applyMarketArtifact, isMarketTool } from '../../web/market-ui.js';
import { buildSystemPrompt } from '../prompts/system.js';
import { openaiToolDefinitions } from '../tools/adapter.js';
import { executeAgentTool, parseToolCallArguments, stringifyToolResult } from '../tools/execute.js';
import { ChatRuntimeError, chatTimeout, invalidChatArgs, spendLimit } from './errors.js';
import { resolveChatLimits } from './limits.js';
import { createOpenAIProvider, resolveOpenAIApiKey } from './openai.js';

/**
 * @param {unknown} input
 * @param {number} maxHistory
 */
export function normalizeChatMessages(input, maxHistory) {
  if (!Array.isArray(input)) {
    throw invalidChatArgs('JSON body must include messages: [{ role, content }].');
  }
  const out = [];
  for (const msg of input) {
    if (!msg || typeof msg !== 'object') {
      continue;
    }
    const role = msg.role;
    if (role !== 'user' && role !== 'assistant') {
      continue;
    }
    const content =
      typeof msg.content === 'string' ? msg.content : typeof msg.text === 'string' ? msg.text : '';
    const trimmed = content.trim();
    if (!trimmed) {
      continue;
    }
    out.push({ role, content: trimmed });
  }
  if (out.length === 0) {
    throw invalidChatArgs('Chat turn requires at least one user message.');
  }
  if (out[out.length - 1].role !== 'user') {
    throw invalidChatArgs('The last message must be from the user.');
  }
  return out.slice(-maxHistory);
}

function extractProposalUi(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { confirm_card: null, workspace_panel: null };
  }
  const confirm_card =
    data.confirm_card && typeof data.confirm_card === 'object'
      ? data.confirm_card
      : data.ui === 'chat.confirm_card'
        ? data
        : null;
  const workspace_panel =
    data.workspace_panel && typeof data.workspace_panel === 'object'
      ? data.workspace_panel
      : data.ui === 'workspace.diff_confirm_panel'
        ? data
        : null;
  return { confirm_card, workspace_panel };
}

function mergeArtifacts(artifacts, name, data) {
  if (!data || typeof data !== 'object') {
    return artifacts;
  }
  const next = { ...artifacts };
  if (name === 'ghostwrite_meeting_one_pager' || name === 'get_meeting_one_pager') {
    next.meeting = data;
  }
  if (name === 'get_report' || name === 'create_report_draft' || name === 'update_report_section') {
    next.report = data;
  }
  if (name === 'create_scratchpad' || name === 'get_scratchpad' || name === 'get_scratchpad_impact') {
    next.scratchpad = data;
  }
  if (isMarketTool(name)) {
    next.market = applyMarketArtifact(next.market, name, data);
  }
  const ui = extractProposalUi(data);
  if (ui.confirm_card) {
    next.confirm_card = ui.confirm_card;
  }
  if (ui.workspace_panel) {
    next.workspace_panel = ui.workspace_panel;
  }
  return next;
}

function chunkText(text, size = 48) {
  if (!text) {
    return [];
  }
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

/**
 * @param {object} options
 */
export async function runChatTurn({
  messages,
  session,
  userJwt,
  env = process.env,
  dispatch,
  provider,
  emit = () => {},
  now = Date.now,
} = {}) {
  const isolatedEnv = createChatToolEnv(env);
  assertNoServiceRoleEnv(isolatedEnv);

  if (!userJwt) {
    throw invalidChatArgs('Chat tools require a user JWT.');
  }

  const limits = resolveChatLimits(env);
  const openaiProvider = provider ?? createOpenAIProvider({ env });
  const started = now();
  const deadline = started + limits.turnTimeoutMs;

  const history = normalizeChatMessages(messages, limits.maxHistoryMessages);
  const openaiTools = openaiToolDefinitions();
  const modelMessages = [{ role: 'system', content: buildSystemPrompt({ session }) }, ...history];

  let completionTokens = 0;
  const toolTrace = [];
  let artifacts = {};
  let assistantText = '';

  const remainingMs = () => deadline - now();
  const assertTime = () => {
    if (remainingMs() <= 0) {
      throw chatTimeout();
    }
  };

  for (let round = 0; round <= limits.maxToolRounds; round += 1) {
    assertTime();
    const timeoutMs = Math.max(1, Math.min(limits.providerTimeoutMs, remainingMs()));
    const signal = AbortSignal.timeout(timeoutMs);
    let completion;
    try {
      completion = await openaiProvider.completeChat({
        messages: modelMessages,
        tools: openaiTools,
        signal,
      });
    } catch (err) {
      if (err instanceof ChatRuntimeError) {
        throw err;
      }
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw chatTimeout();
      }
      throw err;
    }

    completionTokens += Number(completion?.usage?.completion_tokens) || 0;
    if (completionTokens > limits.maxCompletionTokensPerTurn) {
      throw spendLimit('Chat turn exceeded the spend-safe token budget.');
    }

    const toolCalls = Array.isArray(completion?.toolCalls) ? completion.toolCalls.filter((c) => c?.name) : [];
    if (toolCalls.length === 0) {
      assistantText = typeof completion?.content === 'string' ? completion.content : '';
      for (const chunk of chunkText(assistantText)) {
        emit({ event: 'delta', data: { text: chunk } });
      }
      break;
    }

    modelMessages.push({
      role: 'assistant',
      content: completion?.content || null,
      tool_calls: toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments ?? {}) },
      })),
    });

    for (const call of toolCalls) {
      assertTime();
      emit({ event: 'tool', data: { name: call.name, status: 'running', id: call.id } });
      const parsed = parseToolCallArguments(call.arguments);
      let result;
      if (!parsed.ok) {
        result = { ok: false, error: parsed.error };
      } else {
        try {
          result = await executeAgentTool({
            name: call.name,
            args: parsed.value,
            session,
            userJwt,
            env: isolatedEnv,
            dispatch,
          });
        } catch (err) {
          result = {
            ok: false,
            error: { code: 'tool_failed', message: err.message },
          };
        }
      }
      const pending = Boolean(
        result?.ok &&
          result.data &&
          (result.data.confirm_card?.status === 'pending' ||
            result.data.status === 'pending' ||
            (result.data.ui === 'chat.confirm_card' && result.data.status === 'pending'))
      );
      const status = result?.ok ? (pending ? 'pending_confirm' : 'ok') : 'error';
      const ui = result?.ok ? extractProposalUi(result.data) : { confirm_card: null, workspace_panel: null };
      const market = result?.ok && isMarketTool(call.name) ? result.data : null;
      emit({
        event: 'tool',
        data: {
          name: call.name,
          status,
          id: call.id,
          ok: Boolean(result?.ok),
          error: result?.error,
          ...(ui.confirm_card ? { confirm_card: ui.confirm_card } : {}),
          ...(ui.workspace_panel ? { workspace_panel: ui.workspace_panel } : {}),
          ...(market ? { market } : {}),
        },
      });
      toolTrace.push({
        id: call.id,
        name: call.name,
        ok: Boolean(result?.ok),
        status,
        error: result?.error,
      });
      if (result?.ok) {
        artifacts = mergeArtifacts(artifacts, call.name, result.data);
      }
      modelMessages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: stringifyToolResult(result, limits.toolResultChars),
      });
    }

    if (round === limits.maxToolRounds) {
      assistantText =
        'I hit the spend-safe tool-round limit before finishing. Confirm any pending proposal on the card, or send a narrower follow-up.';
      emit({ event: 'delta', data: { text: assistantText } });
      break;
    }
  }

  const done = {
    ok: true,
    text: assistantText,
    tools: toolTrace,
    confirm_card: artifacts.confirm_card ?? null,
    workspace_panel: artifacts.workspace_panel ?? null,
    artifacts: {
      meeting: artifacts.meeting ?? null,
      report: artifacts.report ?? null,
      scratchpad: artifacts.scratchpad ?? null,
      market: artifacts.market ?? null,
    },
    model: openaiProvider.model ?? resolveChatLimits(env).model,
  };
  emit({ event: 'done', data: done });
  return done;
}

/**
 * Fail loud if the process would try to run without a key and without a mock.
 * @param {object} options
 */
export function assertChatProviderReady({ env = process.env, provider } = {}) {
  if (provider) {
    return;
  }
  resolveOpenAIApiKey(env);
}
