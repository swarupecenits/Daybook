import { db, type SqlRow, type SqlValue } from './adapter';
import type { Entry, Expense, LogItem, Note, Person, Task } from '@/lib/types';

type Codec = 'bool' | 'json';
type Columns<T> = { [K in keyof T]-?: string | readonly [column: string, codec: Codec] };

export type Table<T extends { id: string }> = {
  name: string;
  save(record: T): void;
  destroy(ids: readonly string[]): void;
  loadAll(): Promise<T[]>;
};

function parseJson(value: SqlValue): unknown {
  if (typeof value !== 'string') return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function table<T extends { id: string }>(name: string, columns: Columns<T>): Table<T> {
  const spec = (Object.keys(columns) as (keyof T & string)[]).map((key) => {
    const c = columns[key];
    return typeof c === 'string' ? { key, col: c, codec: null } : { key, col: c[0], codec: c[1] };
  });
  const cols = spec.map((s) => s.col);
  const upsert =
    `INSERT INTO ${name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ` +
    `ON CONFLICT (id) DO UPDATE SET ${cols
      .filter((c) => c !== 'id')
      .map((c) => `${c} = excluded.${c}`)
      .join(', ')}`;
  const select = `SELECT ${cols.join(', ')} FROM ${name}`;

  const encode = (record: T): SqlValue[] =>
    spec.map(({ key, codec }) => {
      const value: unknown = record[key];
      if (codec === 'bool') return value ? 1 : 0;
      if (codec === 'json') return JSON.stringify(value ?? []);
      return (value ?? null) as SqlValue;
    });

  const decode = (row: SqlRow): T => {
    const out: Record<string, unknown> = {};
    for (const { key, col, codec } of spec) {
      const value = row[col];
      out[key] = codec === 'bool' ? value === 1 : codec === 'json' ? parseJson(value) : (value ?? null);
    }
    return out as T;
  };

  return {
    name,
    save(record) {
      db().run(upsert, encode(record));
    },
    destroy(ids) {
      if (!ids.length) return;
      db().tx(() => {
        for (const id of ids) db().run(`DELETE FROM ${name} WHERE id = ?`, [id]);
      });
    },
    async loadAll() {
      const rows = await db().all<SqlRow>(select);
      return rows.map(decode);
    },
  };
}

const stamps = { createdAt: 'created_at', updatedAt: 'updated_at', deletedAt: 'deleted_at' } as const;

export const notesTable = table<Note>('notes', {
  id: 'id',
  title: 'title',
  body: 'body',
  color: 'color',
  pinned: ['pinned', 'bool'],
  archived: ['archived', 'bool'],
  ...stamps,
});

export const tasksTable = table<Task>('tasks', {
  id: 'id',
  title: 'title',
  notes: 'notes',
  dueDate: 'due_date',
  dueTime: 'due_time',
  priority: 'priority',
  tag: 'tag',
  subtasks: ['subtasks', 'json'],
  repeat: 'repeat',
  anchorDay: 'anchor_day',
  remind: ['remind', 'bool'],
  notifId: 'notif_id',
  doneAt: 'done_at',
  ...stamps,
});

export const logsTable = table<LogItem>('logs', { id: 'id', day: 'day', text: 'text', ...stamps });

export const peopleTable = table<Person>('people', {
  id: 'id',
  name: 'name',
  phone: 'phone',
  upi: 'upi',
  note: 'note',
  archived: ['archived', 'bool'],
  ...stamps,
});

export const entriesTable = table<Entry>('entries', {
  id: 'id',
  personId: 'person_id',
  kind: 'kind',
  amount: 'amount',
  note: 'note',
  date: 'date',
  expenseId: 'expense_id',
  ...stamps,
});

export const expensesTable = table<Expense>('expenses', {
  id: 'id',
  title: 'title',
  amount: 'amount',
  share: 'share',
  category: 'category',
  method: 'method',
  date: 'date',
  note: 'note',
  paidBy: 'paid_by',
  split: ['split', 'json'],
  ...stamps,
});

export function saveSettingsRows(patch: Record<string, unknown>) {
  db().tx(() => {
    for (const [key, value] of Object.entries(patch)) {
      db().run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        [key, JSON.stringify(value)],
      );
    }
  });
}

export async function loadSettingsRows(): Promise<Map<string, unknown>> {
  const rows = await db().all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const out = new Map<string, unknown>();
  for (const row of rows) {
    try {
      out.set(row.key, JSON.parse(row.value));
    } catch {
      // Ignore a damaged value; the default applies.
    }
  }
  return out;
}

/** Deletes rows for good across tables in one transaction, ledger rows before what they hang off. */
export function destroyRows(plan: Readonly<Record<'notes' | 'tasks' | 'logs' | 'people' | 'entries' | 'expenses', readonly string[]>>) {
  db().tx(() => {
    entriesTable.destroy(plan.entries);
    expensesTable.destroy(plan.expenses);
    peopleTable.destroy(plan.people);
    logsTable.destroy(plan.logs);
    tasksTable.destroy(plan.tasks);
    notesTable.destroy(plan.notes);
  });
}

export function eraseAllRows() {
  db().tx(() => {
    for (const name of ['entries', 'expenses', 'people', 'logs', 'tasks', 'notes', 'settings']) {
      db().run(`DELETE FROM ${name}`);
    }
  });
}
