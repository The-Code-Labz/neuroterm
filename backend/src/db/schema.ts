export const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 22,
  username TEXT NOT NULL,
  auth_type TEXT NOT NULL CHECK (auth_type IN ('password', 'private_key')),
  password_enc TEXT,
  private_key_enc TEXT,
  passphrase_enc TEXT,
  tmux_session TEXT NOT NULL DEFAULT 'neuroterm',
  mode TEXT NOT NULL DEFAULT 'ssh' CHECK (mode IN ('ssh', 'local')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS terminal_sessions (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('local', 'ssh')),
  name TEXT NOT NULL,
  tmux_session TEXT NOT NULL,
  connection_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'closed')) DEFAULT 'active',
  cols INTEGER NOT NULL DEFAULT 220,
  rows INTEGER NOT NULL DEFAULT 50,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_connected_at TEXT,
  closed_at TEXT,
  FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_terminal_sessions_status ON terminal_sessions(status);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_connection ON terminal_sessions(connection_id);
CREATE INDEX IF NOT EXISTS idx_connections_name ON connections(name);
`;
