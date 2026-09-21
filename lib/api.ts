export type V1Result<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  audit_id?: string;
  status: number;
};

export async function v1Fetch<T = unknown>(
  path: string,
  options: {
    token: string;
    firmId?: string | null;
    method?: string;
    body?: unknown;
  }
): Promise<V1Result<T>> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${options.token}`,
  };
  if (options.firmId) {
    headers['x-firm-id'] = options.firmId;
  }
  const method = options.method ?? (options.body ? 'POST' : 'GET');
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(path, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });
  let json: { ok?: boolean; data?: T; error?: { code?: string; message?: string }; audit_id?: string } = {};
  try {
    json = (await response.json()) as typeof json;
  } catch {
    json = { ok: false, error: { code: 'invalid_json', message: 'API did not return JSON.' } };
  }
  return {
    ok: Boolean(json.ok),
    data: json.data,
    error: json.error,
    audit_id: json.audit_id,
    status: response.status,
  };
}

export function callTool<T = unknown>(
  token: string,
  firmId: string | null | undefined,
  name: string,
  args: Record<string, unknown> = {}
) {
  return v1Fetch<T>('/v1/tools', {
    token,
    firmId,
    method: 'POST',
    body: { name, args },
  });
}

export type ChatSseToolEvent = {
  name?: string;
  status?: 'running' | 'ok' | 'error' | 'pending_confirm';
  id?: string;
  ok?: boolean;
  error?: { code?: string; message?: string };
};

export type ChatTurnResult = {
  ok: boolean;
  text?: string;
  tools?: ChatSseToolEvent[];
  confirm_card?: unknown;
  workspace_panel?: unknown;
  artifacts?: {
    meeting?: unknown;
    report?: unknown;
    scratchpad?: unknown;
  };
  error?: { code?: string; message?: string };
  status: number;
};

function chatHeaders(token: string, firmId?: string | null) {
  const headers: Record<string, string> = {
    accept: 'text/event-stream',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
  if (firmId) {
    headers['x-firm-id'] = firmId;
  }
  return headers;
}

function applySseBlock(
  block: string,
  handlers: {
    onDelta?: (text: string) => void;
    onTool?: (event: ChatSseToolEvent) => void;
    onDone?: (data: ChatTurnResult) => void;
    onError?: (error: { code?: string; message?: string }) => void;
  }
) {
  const lines = block.split('\n');
  let event = 'message';
  const dataLines: string[] = [];
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
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
  } catch {
    return;
  }
  if (event === 'delta' && typeof data.text === 'string') {
    handlers.onDelta?.(data.text);
  } else if (event === 'tool') {
    handlers.onTool?.(data as ChatSseToolEvent);
  } else if (event === 'done') {
    handlers.onDone?.({ ...(data as ChatTurnResult), ok: data.ok !== false, status: 200 });
  } else if (event === 'error') {
    const error = (data.error as { code?: string; message?: string } | undefined) ?? {
      code: 'openai_error',
      message: 'Chat turn failed.',
    };
    handlers.onError?.(error);
  }
}

export async function streamChatTurn(
  token: string,
  firmId: string | null | undefined,
  messages: Array<{ role: string; content: string }>,
  handlers: {
    onDelta?: (text: string) => void;
    onTool?: (event: ChatSseToolEvent) => void;
    onDone?: (data: ChatTurnResult) => void;
    onError?: (error: { code?: string; message?: string }) => void;
  } = {}
): Promise<ChatTurnResult> {
  const response = await fetch('/v1/chat', {
    method: 'POST',
    headers: chatHeaders(token, firmId),
    body: JSON.stringify({ messages, stream: true }),
    cache: 'no-store',
  });
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('text/event-stream')) {
    let json: {
      ok?: boolean;
      data?: ChatTurnResult;
      error?: { code?: string; message?: string };
    } = {};
    try {
      json = (await response.json()) as typeof json;
    } catch {
      json = { ok: false, error: { code: 'invalid_json', message: 'API did not return JSON.' } };
    }
    if (!json.ok) {
      const error = json.error ?? { code: 'openai_error', message: 'Chat turn failed.' };
      handlers.onError?.(error);
      return { ok: false, error, status: response.status };
    }
    const data = { ...(json.data ?? { ok: true }), ok: true, status: response.status };
    if (data.text) {
      handlers.onDelta?.(data.text);
    }
    handlers.onDone?.(data);
    return data;
  }

  if (!response.body) {
    const error = { code: 'openai_error', message: 'Chat stream had no body.' };
    handlers.onError?.(error);
    return { ok: false, error, status: response.status };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: ChatTurnResult = { ok: true, text: '', status: response.status };

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
      applySseBlock(block, {
        onDelta: handlers.onDelta,
        onTool: handlers.onTool,
        onDone: (data) => {
          finalResult = { ...data, status: response.status };
          handlers.onDone?.(finalResult);
        },
        onError: (error) => {
          finalResult = { ok: false, error, status: response.status };
          handlers.onError?.(error);
        },
      });
      sep = buffer.indexOf('\n\n');
    }
  }
  if (buffer.trim()) {
    applySseBlock(buffer, {
      onDelta: handlers.onDelta,
      onTool: handlers.onTool,
      onDone: (data) => {
        finalResult = { ...data, status: response.status };
        handlers.onDone?.(finalResult);
      },
      onError: (error) => {
        finalResult = { ok: false, error, status: response.status };
        handlers.onError?.(error);
      },
    });
  }
  return finalResult;
}
