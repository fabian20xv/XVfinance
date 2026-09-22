import { consumeChatSseStream } from '@/src/web/chat-sse.js';

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
    credentials: 'include',
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
  confirm_card?: unknown;
  workspace_panel?: unknown;
  market?: Record<string, unknown> | null;
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
    market?: {
      quote?: Record<string, unknown> | null;
      fundamentals?: Record<string, unknown> | null;
      news?: Record<string, unknown> | null;
      search?: Record<string, unknown> | null;
    } | null;
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

export async function streamChatTurn(
  token: string,
  firmId: string | null | undefined,
  messages: Array<{ role: string; content: string }>,
  handlers: {
    onStarted?: (data: Record<string, unknown>) => void;
    onDelta?: (text: string) => void;
    onTool?: (event: ChatSseToolEvent) => void;
    onDone?: (data: ChatTurnResult) => void;
    onError?: (error: { code?: string; message?: string }) => void;
  } = {}
): Promise<ChatTurnResult> {
  const response = await fetch('/v1/ai/chat', {
    method: 'POST',
    headers: chatHeaders(token, firmId),
    body: JSON.stringify({ messages, stream: true }),
    cache: 'no-store',
    credentials: 'include',
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

  return consumeChatSseStream(
    response.body,
    {
      onStarted: handlers.onStarted,
      onDelta: handlers.onDelta,
      onTool: handlers.onTool as ((event: Record<string, unknown>) => void) | undefined,
      onDone: (data) => handlers.onDone?.(data as ChatTurnResult),
      onError: handlers.onError,
    },
    response.status
  ) as Promise<ChatTurnResult>;
}
