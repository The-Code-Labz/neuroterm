const TOKEN = import.meta.env.VITE_AUTH_TOKEN ?? '';

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Connections ───────────────────────────────────────────────────────────────

export interface ApiConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: string;
  tmux_session: string;
  mode: string;
  created_at: string;
  updated_at: string;
}

export interface CreateConnectionPayload {
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: 'password' | 'private_key';
  password?: string;
  private_key?: string;
  passphrase?: string;
  tmux_session: string;
  mode: 'ssh' | 'local';
}

export const api = {
  connections: {
    list: ()                                    => req<ApiConnection[]>('GET', '/api/connections'),
    create: (p: CreateConnectionPayload)        => req<ApiConnection>('POST', '/api/connections', p),
    update: (id: string, p: Partial<CreateConnectionPayload>) => req<ApiConnection>('PATCH', `/api/connections/${id}`, p),
    delete: (id: string)                        => req<void>('DELETE', `/api/connections/${id}`),
  },

  sessions: {
    list: ()   => req<ApiSession[]>('GET', '/api/sessions'),
    tmux: ()   => req<TmuxSessionInfo[]>('GET', '/api/sessions/tmux'),
    create: (p: CreateSessionPayload) => req<ApiSession>('POST', '/api/sessions', p),
    close: (id: string) => req<void>('POST', `/api/sessions/${id}/close`),
  },
};

export interface ApiSession {
  id: string;
  mode: string;
  name: string;
  tmux_session: string;
  connection_id: string | null;
  status: string;
  cols: number;
  rows: number;
  wsUrl: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSessionPayload {
  name: string;
  tmux_session: string;
  mode: 'local' | 'ssh';
  connection_id?: string;
  cols?: number;
  rows?: number;
}

export interface TmuxSessionInfo {
  name: string;
  windows: number;
  created: string;
}
