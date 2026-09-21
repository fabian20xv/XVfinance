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

export type ChatEvent = { type: string; data: unknown };

export async function postChat(options: {
  token: string;
  firmId?: string | null;
  message: string;
  messages?: Array<{ role: string; content: string }>;
  stream?: boolean;
  onEvent?: (event: ChatEvent) => void;
}): Promise<V1Result<{
  message?: string;
  events?: ChatEvent[];
  tool_calls?: unknown[];
  proposals?: unknown[];
  finish_reason?: string;
}>> {
  const headers: Record<string, string> = {
    accept: options.stream === false ? 'application/json' : 'text/event-stream',
    authorization: `Bearer ${options.token}`,
    'content-type': 'application/json',
  };
  if (options.firmId) {
    headers['x-firm-id'] = options.firmId;
  }
  const response = await fetch('/v1/chat', {
    method: 'POST',
    headers,
    cache: 'no-store',
    body: JSON.stringify({
      message: options.message,
      messages: options.messages ?? [],
      stream: options.stream !== false,
    }),
  });

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    const { readChatSse } = await import('@/src/web/chat-stream.js');
    let done: {
      ok?: boolean;
      message?: string;
      error?: { code?: string; message?: string };
      finish_reason?: string;
      tool_calls?: unknown[];
      proposals?: unknown[];
    } | null = null;
    const events: ChatEvent[] = [];
    await readChatSse(response, (event) => {
      events.push(event);
      options.onEvent?.(event);
      if (event.type === 'done' && event.data && typeof event.data === 'object') {
        done = event.data as typeof done;
      }
    });
    const ok = done?.ok !== false && response.ok;
    return {
      ok,
      data: {
        message: done?.message,
        events,
        tool_calls: done?.tool_calls,
        proposals: done?.proposals,
        finish_reason: done?.finish_reason,
      },
      error: done?.error ?? (ok ? undefined : { code: 'tool_failed', message: 'Chat turn failed.' }),
      status: response.status,
    };
  }

  let json: {
    ok?: boolean;
    data?: {
      message?: string;
      events?: ChatEvent[];
      tool_calls?: unknown[];
      proposals?: unknown[];
      finish_reason?: string;
    };
    error?: { code?: string; message?: string };
  } = {};
  try {
    json = (await response.json()) as typeof json;
  } catch {
    json = { ok: false, error: { code: 'invalid_json', message: 'API did not return JSON.' } };
  }
  if (Array.isArray(json.data?.events)) {
    for (const event of json.data.events) {
      options.onEvent?.(event);
    }
  }
  return {
    ok: Boolean(json.ok),
    data: json.data,
    error: json.error,
    status: response.status,
  };
}
