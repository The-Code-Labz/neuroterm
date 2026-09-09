import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import { openDatabase } from '../src/db/sqlite';

// Simulates a pre-multi-user database (the original schema, before user_id /
// host_key_fingerprint / the per-user unique index existed) to verify
// `openDatabase` migrates it forward without dropping data.
function seedLegacyDatabase(path: string): void {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE credentials (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, host TEXT, username TEXT NOT NULL,
      auth_type TEXT NOT NULL, password_enc TEXT, private_key_enc TEXT, passphrase_enc TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE connections (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, host TEXT NOT NULL, port INTEGER NOT NULL DEFAULT 22,
      username TEXT NOT NULL, auth_type TEXT NOT NULL, password_enc TEXT, private_key_enc TEXT,
      passphrase_enc TEXT, credential_id TEXT, tmux_session TEXT NOT NULL DEFAULT 'neuroterm',
      mode TEXT NOT NULL DEFAULT 'ssh', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE terminal_sessions (
      id TEXT PRIMARY KEY, mode TEXT NOT NULL, name TEXT NOT NULL, tmux_session TEXT NOT NULL,
      connection_id TEXT, status TEXT NOT NULL DEFAULT 'active', cols INTEGER NOT NULL DEFAULT 220,
      rows INTEGER NOT NULL DEFAULT 50, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      last_connected_at TEXT, closed_at TEXT
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
  `);

  const id = crypto.randomUUID();
  const ts = new Date().toISOString();
  db.prepare(`
    INSERT INTO connections (id, name, host, port, username, auth_type, tmux_session, mode, created_at, updated_at)
    VALUES (?, 'prod', '10.0.0.1', 22, 'root', 'password', 'neuroterm', 'ssh', ?, ?)
  `).run(id, ts, ts);

  db.close();
}

describe('sqlite migrations', () => {
  it('migrates a legacy DB (global UNIQUE connections.name) forward, preserving rows and allowing per-user duplicate names', () => {
    const dbPath = `/tmp/neuroterm-migration-test-${crypto.randomUUID()}.sqlite`;
    seedLegacyDatabase(dbPath);

    const db = openDatabase(dbPath);

    const rows = db.prepare(`SELECT id, name, host, user_id, host_key_fingerprint FROM connections`).all() as Array<{
      id: string; name: string; host: string; user_id: string | null; host_key_fingerprint: string | null;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('prod');
    expect(rows[0].host).toBe('10.0.0.1');
    expect(rows[0].user_id).toBeNull();
    expect(rows[0].host_key_fingerprint).toBeNull();

    // Two different users can now both have a connection named "prod" —
    // this would violate the old global UNIQUE(name) constraint.
    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const ts = new Date().toISOString();
    for (const uid of [userA, userB]) {
      db.prepare(`
        INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
        VALUES (?, ?, 'x', 'user', ?, ?)
      `).run(uid, `u-${uid}`, ts, ts);
    }

    expect(() => {
      db.prepare(`
        INSERT INTO connections (id, user_id, name, host, username, auth_type, tmux_session, mode, created_at, updated_at)
        VALUES (?, ?, 'prod', '10.0.0.2', 'root', 'password', 'neuroterm', 'ssh', ?, ?)
      `).run(crypto.randomUUID(), userA, ts, ts);

      db.prepare(`
        INSERT INTO connections (id, user_id, name, host, username, auth_type, tmux_session, mode, created_at, updated_at)
        VALUES (?, ?, 'prod', '10.0.0.3', 'root', 'password', 'neuroterm', 'ssh', ?, ?)
      `).run(crypto.randomUUID(), userB, ts, ts);
    }).not.toThrow();

    // ...but the SAME user still can't have two connections with the same name.
    expect(() => {
      db.prepare(`
        INSERT INTO connections (id, user_id, name, host, username, auth_type, tmux_session, mode, created_at, updated_at)
        VALUES (?, ?, 'prod', '10.0.0.4', 'root', 'password', 'neuroterm', 'ssh', ?, ?)
      `).run(crypto.randomUUID(), userA, ts, ts);
    }).toThrow();
  });
});
