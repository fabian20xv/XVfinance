/**
 * OpenAI Chat Completions provider (primary). Inject a mock in tests.
 * Never silently succeeds without a real key.
 */
import { ChatRuntimeError, missingOpenAIKey } from './errors.js';
import { resolveChatLimits } from './limits.js';

/**
 * @param {unknown} value
 */
export function isUsableOpenAIApiKey(value) {
  if (value == null) {
    return false;
  }
  const key = String(value).trim();
  if (!key) {
    return false;
  }
  return !/replace-with|placeholder|changeme|your-openai|sk-xxx/i.test(key);
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function resolveOpenAIApiKey(env = process.env) {
  if (!isUsableOpenAIApiKey(env?.OPENAI_API_KEY)) {
    throw missingOpenAIKey();
  }
  return String(env.OPENAI_API_KEY).trim();
}

/**
 * @param {object} [options]
 * @param {string} [options.apiKey]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {typeof fetch} [options.fetchImpl]
 */
export function createOpenAIProvider({ apiKey, env = process.env, fetchImpl = fetch } = {}) {
  const key = apiKey ?? resolveOpenAIApiKey(env);
  const limits = resolveChatLimits(env);

  return Object.freeze({
    name: 'openai',
    model: limits.model,
    /**
     * @param {object} input
     * @param {Array<object>} input.messages
     * @param {Array<object>} [input.tools]
     * @param {AbortSignal} [input.signal]
     */
    async completeChat({ messages, tools = [], signal } = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), limits.providerTimeoutMs);
      const onAbort = () => controller.abort();
      if (signal) {
        if (signal.aborted) {
          controller.abort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      }
      try {
        const body = {
          model: limits.model,
          messages,
          temperature: limits.temperature,
          max_tokens: limits.maxOutputTokens,
        };
        if (tools.length > 0) {
          body.tools = tools;
          body.tool_choice = 'auto';
        }
        const response = await fetchImpl(`${limits.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${key}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const payload = await readJson(response);
        if (!response.ok) {
          const detail = payload?.error?.message || payload?.message || response.statusText;
          throw new ChatRuntimeError(
            'openai_error',
            `OpenAI request failed (${response.status}): ${detail}`,
            response.status >= 500 ? 503 : 400
          );
        }
        return normalizeCompletion(payload);
      } catch (err) {
        if (err instanceof ChatRuntimeError) {
          throw err;
        }
        if (err?.name === 'AbortError') {
          throw new ChatRuntimeError('openai_timeout', 'OpenAI request timed out.', 504);
        }
        throw new ChatRuntimeError('openai_error', err.message || 'OpenAI request failed.', 503);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener?.('abort', onAbort);
      }
    },
  });
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function normalizeCompletion(payload) {
  const choice = payload?.choices?.[0];
  const message = choice?.message ?? {};
  const toolCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls.map((call) => ({
        id: String(call.id || `call_${Math.random().toString(36).slice(2)}`),
        name: call.function?.name || call.name,
        arguments: call.function?.arguments ?? call.arguments ?? '{}',
      }))
    : [];
  return {
    content: typeof message.content === 'string' ? message.content : '',
    toolCalls,
    usage: {
      prompt_tokens: Number(payload?.usage?.prompt_tokens) || 0,
      completion_tokens: Number(payload?.usage?.completion_tokens) || 0,
    },
    raw: payload,
  };
}
