/**
 * Browser SSE consumer for POST /v1/ai/chat.
 * Shared by the Dana composer (lib/api.ts) and Node tests.
 */

/**
 * @param {string} block
 * @param {{
 *   onStarted?: (data: Record<string, unknown>) => void,
 *   onDelta?: (text: string) => void,
 *   onTool?: (event: Record<string, unknown>) => void,
 *   onDone?: (data: Record<string, unknown>) => void,
 *   onError?: (error: { code?: string, message?: string }) => void,
 * }} handlers
 */
export function applyChatSseBlock(block, handlers) {
  const lines = String(block).split('\n');
  let event = 'message';
  const dataLines = [];
  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }
  if (dataLines.length === 0) {
    return;
  }
  let data = {};
  try {
    data = JSON.parse(dataLines.join('\n'));
  } catch {
    return;
  }
  if (event === 'started') {
    handlers.onStarted?.(data);
  } else if (event === 'delta' && typeof data.text === 'string') {
    handlers.onDelta?.(data.text);
  } else if (event === 'tool') {
    handlers.onTool?.(data);
  } else if (event === 'done') {
    handlers.onDone?.({ ...data, ok: data.ok !== false, status: 200 });
  } else if (event === 'error') {
    const error = data.error ?? {
      code: 'openai_error',
      message: 'Chat turn failed.',
    };
    handlers.onError?.(error);
  }
}

/**
 * Read a `text/event-stream` body to completion.
 * Incomplete streams (no `done`) fail loud — they are not treated as success.
 *
 * @param {ReadableStream<Uint8Array> | null | undefined} body
 * @param {{
 *   onStarted?: (data: Record<string, unknown>) => void,
 *   onDelta?: (text: string) => void,
 *   onTool?: (event: Record<string, unknown>) => void,
 *   onDone?: (data: Record<string, unknown>) => void,
 *   onError?: (error: { code?: string, message?: string }) => void,
 * }} [handlers]
 * @param {number} [status]
 */
export async function consumeChatSseStream(body, handlers = {}, status = 200) {
  if (!body) {
    const error = { code: 'openai_error', message: 'Chat stream had no body.' };
    handlers.onError?.(error);
    return { ok: false, error, status };
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawDone = false;
  let assembled = '';
  /** @type {Record<string, unknown>} */
  let finalResult = { ok: true, text: '', status };

  const route = {
    onStarted: handlers.onStarted,
    onDelta: (text) => {
      assembled += text;
      finalResult = { ...finalResult, text: assembled };
      handlers.onDelta?.(text);
    },
    onTool: (event) => {
      if (event?.confirm_card && typeof event.confirm_card === 'object') {
        finalResult.confirm_card = event.confirm_card;
      }
      if (event?.workspace_panel && typeof event.workspace_panel === 'object') {
        finalResult.workspace_panel = event.workspace_panel;
      }
      handlers.onTool?.(event);
    },
    onDone: (data) => {
      sawDone = true;
      finalResult = { ...data, text: data.text || assembled, status };
      handlers.onDone?.(finalResult);
    },
    onError: (error) => {
      finalResult = { ok: false, error, text: assembled, status };
      handlers.onError?.(error);
    },
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let sep = buffer.indexOf('\n\n');
    while (sep !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      applyChatSseBlock(block, route);
      sep = buffer.indexOf('\n\n');
    }
  }
  if (buffer.trim()) {
    applyChatSseBlock(buffer, route);
  }

  if (!sawDone && finalResult.ok) {
    const error = {
      code: 'openai_error',
      message: 'Chat stream ended before a done event.',
    };
    handlers.onError?.(error);
    return { ok: false, error, text: assembled, status, confirm_card: finalResult.confirm_card, workspace_panel: finalResult.workspace_panel };
  }
  return finalResult;
}
