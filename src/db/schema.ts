import type { Db } from './adapter';

const V1 = `
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'plain',
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  due_time TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  tag TEXT,
  subtasks TEXT NOT NULL DEFAULT '[]',
  repeat TEXT NOT NULL DEFAULT 'none',
  anchor_day INTEGER,
  remind INTEGER NOT NULL DEFAULT 0,
  notif_id TEXT,
  done_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS tasks_due ON tasks (due_date);
CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY NOT NULL,
  day TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS logs_day ON logs (day);
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  upi TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY NOT NULL,
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('gave', 'got')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  note TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  expense_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS entries_person ON entries (person_id);
CREATE INDEX IF NOT EXISTS entries_expense ON entries (expense_id);
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  share INTEGER NOT NULL CHECK (share >= 0 AND share <= amount),
  category TEXT NOT NULL,
  method TEXT NOT NULL,
  date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  paid_by TEXT NOT NULL DEFAULT 'me',
  split TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS expenses_date ON expenses (date);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

const MIGRATIONS = [V1];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Applies pending migrations, each in its own transaction, tracked with `PRAGMA user_version`. */
export async function migrate(db: Db): Promise<number> {
  const [row] = await db.all<{ user_version: number }>('PRAGMA user_version');
  let version = Number(row?.user_version ?? 0);
  if (version > SCHEMA_VERSION) {
    throw new Error('This data was saved by a newer version of Daybook. Update the app to open it.');
  }
  while (version < SCHEMA_VERSION) {
    const next = version + 1;
    try {
      await db.exec(`BEGIN;\n${MIGRATIONS[version]}\nPRAGMA user_version = ${next};\nCOMMIT;`);
    } catch (error) {
      await db.exec('ROLLBACK;').catch(() => undefined);
      throw error;
    }
    version = next;
  }
  return version;
}
