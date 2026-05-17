import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { schemaSql } from './schema';

export type AppDatabase = Database.Database;

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

  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('schema_version', '1', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(new Date().toISOString());

  return db;
}
