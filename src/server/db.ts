import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DATA_DIR = path.join(os.homedir(), '.aicorp');
const DB_FILE = path.join(DATA_DIR, 'data.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    db = new Database(DB_FILE);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

function initTables(): void {
  const d = db!;
  d.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      collection TEXT NOT NULL,
      workspace_id TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_entities_collection ON entities(collection);
    CREATE INDEX IF NOT EXISTS idx_entities_workspace ON entities(workspace_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_tokens (
      token TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
}

export function loadCollection<T>(collection: string, workspaceId?: string): T[] {
  const d = getDb();
  const query = workspaceId
    ? `SELECT data FROM entities WHERE collection = ? AND workspace_id = ?`
    : `SELECT data FROM entities WHERE collection = ?`;
  const params = workspaceId ? [collection, workspaceId] : [collection];
  const rows = d.prepare(query).all(...params) as { data: string }[];
  return rows.map(r => JSON.parse(r.data) as T);
}

export function saveCollection(collection: string, items: unknown[], getWorkspaceId: (item: any) => string): void {
  const d = getDb();
  const now = new Date().toISOString();

  const deleteStmt = d.prepare('DELETE FROM entities WHERE collection = ?');
  const insertStmt = d.prepare(
    'INSERT OR REPLACE INTO entities (id, collection, workspace_id, data, updated_at) VALUES (?, ?, ?, ?, ?)'
  );

  const transaction = d.transaction(() => {
    deleteStmt.run(collection);
    for (const item of items) {
      const obj = item as any;
      insertStmt.run(obj.id, collection, getWorkspaceId(obj) || '', JSON.stringify(obj), now);
    }
  });

  transaction();
}

export function loadSetting(key: string): string | undefined {
  const d = getDb();
  const row = d.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function saveSetting(key: string, value: string): void {
  const d = getDb();
  d.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

export function loadAllSettings(): Record<string, string> {
  const d = getDb();
  const rows = d.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export function saveToken(token: string, expiresAt: string): void {
  const d = getDb();
  d.prepare('INSERT INTO auth_tokens (token, created_at, expires_at) VALUES (?, ?, ?)').run(
    token,
    new Date().toISOString(),
    expiresAt
  );
}

export function validateToken(token: string): boolean {
  const d = getDb();
  const row = d.prepare(
    'SELECT expires_at FROM auth_tokens WHERE token = ?'
  ).get(token) as { expires_at: string } | undefined;

  if (!row) return false;

  if (new Date(row.expires_at) < new Date()) {
    d.prepare('DELETE FROM auth_tokens WHERE token = ?').run(token);
    return false;
  }

  return true;
}

export function deleteToken(token: string): void {
  const d = getDb();
  d.prepare('DELETE FROM auth_tokens WHERE token = ?').run(token);
}

export function deleteSetting(key: string): void {
  const d = getDb();
  d.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

export function clearAllTokens(): void {
  const d = getDb();
  d.prepare('DELETE FROM auth_tokens').run();
}

export function cleanupExpiredTokens(): void {
  const d = getDb();
  d.prepare('DELETE FROM auth_tokens WHERE expires_at < ?').run(new Date().toISOString());
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
