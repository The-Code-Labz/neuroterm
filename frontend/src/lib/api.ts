// ── Auth token resolution ─────────────────────────────────────────────────────
// JWT from localStorage — set by login flow (useAuth hook)
function getToken(): string {
  return localStorage.getItem('neuroterm_jwt') ?? ''
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
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

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApiUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  created_at: string;
}

export interface ApiCredential {
  id: string;
  name: string;
  host: string | null;
  username: string;
  auth_type: 'password' | 'private_key';
  has_password: boolean;
  has_private_key: boolean;
  has_passphrase: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCredentialPayload {
  name: string;
  host?: string;
  username: string;
  auth_type: 'password' | 'private_key';
  password?: string;
  private_key?: string;
  passphrase?: string;
}

export interface ApiConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: string;
  tmux_session: string;
  mode: string;
  credential_id?: string | null;
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
  credential_id?: string;
  tmux_session: string;
  mode: 'ssh' | 'local';
}

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

export type FileScope = { mode: 'local' } | { mode: 'ssh'; connection_id: string };

export interface FileEntryInfo {
  name: string;
  type: 'file' | 'dir' | 'other';
  size: number;
  mtime: number;
}

export interface ListFilesResult {
  path: string;
  entries: FileEntryInfo[];
}

export interface ReadFileResult {
  path: string;
  binary: boolean;
  content?: string;
  size: number;
  mtime: number;
  truncated: boolean;
}

function qs(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) usp.set(k, v);
  return usp.toString();
}

function scopeParams(scope: FileScope): Record<string, string> {
  return scope.mode === 'ssh' ? { mode: 'ssh', connection_id: scope.connection_id } : { mode: 'local' };
}

// ── API ───────────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    login:    (username: string, password: string) =>
      req<{ token: string; user: ApiUser }>('POST', '/api/auth/login', { username, password }),
    register: (username: string, password: string) =>
      req<{ token: string; user: ApiUser }>('POST', '/api/auth/register', { username, password }),
    me:       () => req<ApiUser>('GET', '/api/auth/me'),
    logout:   () => req<void>('POST', '/api/auth/logout'),
    logoutAll: () => req<void>('POST', '/api/auth/logout-all'),
  },

  credentials: {
    list:   ()                                             => req<ApiCredential[]>('GET', '/api/credentials'),
    get:    (id: string)                                   => req<ApiCredential>('GET', `/api/credentials/${id}`),
    create: (p: CreateCredentialPayload)                   => req<ApiCredential>('POST', '/api/credentials', p),
    update: (id: string, p: Partial<CreateCredentialPayload>) => req<ApiCredential>('PATCH', `/api/credentials/${id}`, p),
    delete: (id: string)                                   => req<void>('DELETE', `/api/credentials/${id}`),
  },

  connections: {
    list:   ()                                                  => req<ApiConnection[]>('GET', '/api/connections'),
    get:    (id: string)                                        => req<ApiConnection>('GET', `/api/connections/${id}`),
    create: (p: CreateConnectionPayload)                        => req<ApiConnection>('POST', '/api/connections', p),
    update: (id: string, p: Partial<CreateConnectionPayload>)   => req<ApiConnection>('PATCH', `/api/connections/${id}`, p),
    delete: (id: string)                                        => req<void>('DELETE', `/api/connections/${id}`),
  },

  sessions: {
    list:   ()                        => req<ApiSession[]>('GET', '/api/sessions'),
    tmux:   ()                        => req<TmuxSessionInfo[]>('GET', '/api/sessions/tmux'),
    create: (p: CreateSessionPayload) => req<ApiSession>('POST', '/api/sessions', p),
    close:  (id: string)              => req<void>('POST', `/api/sessions/${id}/close`),
  },

  files: {
    list: (scope: FileScope, path: string) =>
      req<ListFilesResult>('GET', `/api/files/list?${qs({ ...scopeParams(scope), path })}`),
    read: (scope: FileScope, path: string) =>
      req<ReadFileResult>('GET', `/api/files/read?${qs({ ...scopeParams(scope), path })}`),
    write: (scope: FileScope, path: string, content: string) =>
      req<{ path: string; size: number; mtime: number }>('POST', '/api/files/write', { ...scopeParams(scope), path, content }),
    mkdir: (scope: FileScope, path: string) =>
      req<{ path: string }>('POST', '/api/files/mkdir', { ...scopeParams(scope), path }),
    delete: (scope: FileScope, path: string, recursive = false) =>
      req<void>('POST', '/api/files/delete', { ...scopeParams(scope), path, recursive }),
    rename: (scope: FileScope, path: string, newPath: string) =>
      req<{ path: string }>('POST', '/api/files/rename', { ...scopeParams(scope), path, new_path: newPath }),
  },
};
