import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { schemaSql } from './schema';

export type AppDatabase = Database.Database;

interface TableInfoRow {
  name: string;
}

function hasColumn(db: AppDatabase, tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as TableInfoRow[];
  return rows.some((row) => row.name === columnName);
}

function connectionsHasLegacyNameUnique(db: AppDatabase): boolean {
  const row = db.prepare(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'connections'`
  ).get() as { sql: string } | undefined;
  return !!row?.sql && /name\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(row.sql);
}

// `connections.name` was declared `UNIQUE` as a column constraint in the
// original schema. Column constraints can't be dropped with ALTER TABLE in
// SQLite, and it must go — a global unique name would make it impossible for
// two different users to ever both have a connection named e.g. "prod" once
// per-user ownership lands. Rebuild the table without it, per SQLite's
// standard 12-step "ALTER TABLE" recipe, preserving all existing rows.
function migrateConnectionsDropLegacyNameUnique(db: AppDatabase): void {
  if (!connectionsHasLegacyNameUnique(db)) return;

  const fkWasOn = (db.pragma('foreign_keys', { simple: true }) as number) === 1;
  db.pragma('foreign_keys = OFF');
  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE connections_new (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 22,
        username TEXT NOT NULL,
        auth_type TEXT NOT NULL CHECK (auth_type IN ('password', 'private_key')),
        password_enc TEXT,
        private_key_enc TEXT,
        passphrase_enc TEXT,
        credential_id TEXT,
        host_key_fingerprint TEXT,
        tmux_session TEXT NOT NULL DEFAULT 'neuroterm',
        mode TEXT NOT NULL DEFAULT 'ssh' CHECK (mode IN ('ssh', 'local')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (credential_id) REFERENCES credentials(id) ON DELETE SET NULL
      );

      INSERT INTO connections_new (
        id, user_id, name, host, port, username, auth_type,
        password_enc, private_key_enc, passphrase_enc, credential_id,
        tmux_session, mode, created_at, updated_at
      )
      SELECT
        id, NULL, name, host, port, username, auth_type,
        password_enc, private_key_enc, passphrase_enc, credential_id,
        tmux_session, mode, created_at, updated_at
      FROM connections;

      DROP TABLE connections;
      ALTER TABLE connections_new RENAME TO connections;
    `);
  });
  migrate();
  if (fkWasOn) db.pragma('foreign_keys = ON');
}

function runMigrations(db: AppDatabase): void {
  migrateConnectionsDropLegacyNameUnique(db);

  // Add credential_id to connections if missing (existing DBs)
  if (!hasColumn(db, 'connections', 'credential_id')) {
    db.prepare(`
      ALTER TABLE connections
      ADD COLUMN credential_id TEXT REFERENCES credentials(id) ON DELETE SET NULL
    `).run();
  }

  // Add host to credentials if missing
  if (!hasColumn(db, 'credentials', 'host')) {
    db.prepare(`ALTER TABLE credentials ADD COLUMN host TEXT`).run();
  }

  // Per-user ownership scoping (existing rows become unowned/legacy — visible
  // only to admins and the static bearer token, same as pre-migration
  // behavior). See backend/src/middleware/auth.ts for the access model.
  if (!hasColumn(db, 'credentials', 'user_id')) {
    db.prepare(`ALTER TABLE credentials ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE`).run();
  }
  if (!hasColumn(db, 'connections', 'user_id')) {
    db.prepare(`ALTER TABLE connections ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE`).run();
  }
  if (!hasColumn(db, 'terminal_sessions', 'user_id')) {
    db.prepare(`ALTER TABLE terminal_sessions ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE`).run();
  }

  // SSH host-key pinning (TOFU) — see spawnSshTmux in ws/terminal-ws.ts.
  if (!hasColumn(db, 'connections', 'host_key_fingerprint')) {
    db.prepare(`ALTER TABLE connections ADD COLUMN host_key_fingerprint TEXT`).run();
  }

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_connections_credential ON connections(credential_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_terminal_sessions_user ON terminal_sessions(user_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_connections_user ON connections(user_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_credentials_user ON credentials(user_id)`).run();
  db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_user_name ON connections(user_id, name)`).run();
  db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_credentials_user_name ON credentials(user_id, name)`).run();
}

export function openDatabase(
  dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'neuroterm.sqlite')
): AppDatabase {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(schemaSql);
  runMigrations(db);

  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('schema_version', '3', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(new Date().toISOString());

  return db;
}
