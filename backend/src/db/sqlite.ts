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

function runMigrations(db: AppDatabase): void {
  // Add credential_id to connections if missing (existing DBs)
  if (!hasColumn(db, 'connections', 'credential_id')) {
    db.prepare(`
      ALTER TABLE connections
      ADD COLUMN credential_id TEXT REFERENCES credentials(id) ON DELETE SET NULL
    `).run();
  }

  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_connections_credential ON connections(credential_id)
  `).run();
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
    VALUES ('schema_version', '2', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(new Date().toISOString());

  return db;
}
