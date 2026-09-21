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
