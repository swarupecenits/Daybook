import { isCategory, isMethod } from './categories';
import { isDayKey, isTimeKey } from './dates';
import { ID_PATTERN } from './ids';
import { LIMITS } from './limits';
import { isValidAmount } from './money';
import { SETTING_CHECKS } from './settings';
import { checkSplit } from './split';
import type { Entry, Expense, LogItem, Note, Person, Settings, Task } from './types';
import { PAPER_COLORS } from '@/theme/palette';

export const BACKUP_FORMAT = 'daybook-backup';
export const BACKUP_VERSION = 1;
const MAX_ROWS = 200_000;

export type BackupData = {
  notes: Note[];
  tasks: Task[];
  logs: LogItem[];
  people: Person[];
  entries: Entry[];
  expenses: Expense[];
};

export type PortableSettings = Pick<
  Settings,
  'name' | 'currency' | 'theme' | 'budget' | 'upi' | 'weekStart' | 'haptics' | 'remindByDefault'
>;

export function buildBackup(data: BackupData, settings: Settings, now: number = Date.now()): string {
  const portable: PortableSettings = {
    name: settings.name,
    currency: settings.currency,
    theme: settings.theme,
    budget: settings.budget,
    upi: settings.upi,
    weekStart: settings.weekStart,
    haptics: settings.haptics,
    remindByDefault: settings.remindByDefault,
  };
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    settings: portable,
    data: { ...data, tasks: data.tasks.map((t) => ({ ...t, notifId: null })) },
  });
}

type Check = (v: unknown) => boolean;
type Shape = Record<string, Check>;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (max: number, required = false): Check => (v) =>
  typeof v === 'string' && v.length <= max && (!required || v.trim().length > 0);
const int = (min: number, max: number): Check => (v) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const bool: Check = (v) => typeof v === 'boolean';
const nullable = (check: Check): Check => (v) => v === null || check(v);
const oneOf = (...values: readonly unknown[]): Check => (v) => values.includes(v);
const stamp = int(0, 4_102_444_800_000);
const id: Check = (v) => typeof v === 'string' && ID_PATTERN.test(v);

const stamped: Shape = { id, createdAt: stamp, updatedAt: stamp, deletedAt: nullable(stamp) };

const subtasks: Check = (v) =>
  Array.isArray(v) &&
  v.length <= LIMITS.subtasks &&
  v.every((s) => isObject(s) && str(64, true)(s.id) && str(LIMITS.title)(s.title) && bool(s.done));

const splitParts: Check = (v) =>
  Array.isArray(v) && v.length <= 50 && v.every((p) => isObject(p) && id(p.personId) && int(0, LIMITS.amount)(p.amount));

const SHAPES = {
  notes: {
    ...stamped,
    title: str(LIMITS.title),
    body: str(LIMITS.body),
    color: oneOf(...PAPER_COLORS),
    pinned: bool,
    archived: bool,
  },
  tasks: {
    ...stamped,
    title: str(LIMITS.title, true),
    notes: str(LIMITS.taskNotes),
    dueDate: nullable(isDayKey),
    dueTime: nullable(isTimeKey),
    priority: oneOf(0, 1, 2, 3),
    tag: nullable(str(LIMITS.tag, true)),
    subtasks,
    repeat: oneOf('none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly'),
    anchorDay: nullable(int(1, 31)),
    remind: bool,
    doneAt: nullable(stamp),
  },
  logs: { ...stamped, day: isDayKey, text: str(LIMITS.log, true) },
  people: {
    ...stamped,
    name: str(LIMITS.name, true),
    phone: str(LIMITS.phone),
    upi: str(LIMITS.upi),
    note: str(LIMITS.note),
    archived: bool,
  },
  entries: {
    ...stamped,
    personId: id,
    kind: oneOf('gave', 'got'),
    amount: isValidAmount,
    note: str(LIMITS.note),
    date: isDayKey,
    expenseId: nullable(id),
  },
  expenses: {
    ...stamped,
    title: str(LIMITS.title, true),
    amount: isValidAmount,
    share: int(0, LIMITS.amount),
    category: isCategory,
    method: isMethod,
    date: isDayKey,
    note: str(LIMITS.note),
    paidBy: (v: unknown) => v === 'me' || id(v),
    split: splitParts,
  },
} satisfies Record<keyof BackupData, Shape>;

/** Copies only known, valid fields. Unknown keys (including `__proto__`) are dropped. */
function pick<T>(raw: unknown, shape: Shape): T | null {
  if (!isObject(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(shape)) {
    const value = raw[key];
    if (!shape[key](value)) return null;
    out[key] = Array.isArray(value) ? value.map((v) => (isObject(v) ? { ...v } : v)) : value;
  }
  return out as T;
}

export type ParsedBackup = {
  ok: true;
  data: BackupData;
  settings: Partial<PortableSettings>;
  exportedAt: number;
  skipped: number;
};

export type BackupError = { ok: false; error: string };

const PORTABLE_KEYS: readonly (keyof PortableSettings)[] = [
  'name',
  'currency',
  'theme',
  'budget',
  'upi',
  'weekStart',
  'haptics',
  'remindByDefault',
];

/**
 * Strictly validates a backup file. Invalid records are skipped (and counted) rather than trusted.
 * `knownPeople` are ids already on this device, so imported entries may reference them.
 */
export function parseBackup(text: string, knownPeople: ReadonlySet<string> = new Set()): ParsedBackup | BackupError {
  if (text.length > LIMITS.backupBytes) return { ok: false, error: 'This file is larger than 25 MB.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not a Daybook backup (invalid JSON).' };
  }
  if (!isObject(raw) || raw.format !== BACKUP_FORMAT) {
    return { ok: false, error: 'This file is not a Daybook backup.' };
  }
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of Daybook.' };
  }
  if (!isObject(raw.data)) return { ok: false, error: 'The backup has no data.' };

  let skipped = 0;
  const table = <T extends { id: string }>(key: keyof BackupData): T[] => {
    const rows = (raw as { data: Record<string, unknown> }).data[key];
    if (rows === undefined) return [];
    if (!Array.isArray(rows) || rows.length > MAX_ROWS) {
      skipped += Array.isArray(rows) ? rows.length : 1;
      return [];
    }
    const seen = new Set<string>();
    const out: T[] = [];
    for (const row of rows) {
      const clean = pick<T>(row, SHAPES[key]);
      if (!clean || seen.has(clean.id)) {
        skipped += 1;
        continue;
      }
      seen.add(clean.id);
      out.push(clean);
    }
    return out;
  };

  const notes = table<Note>('notes');
  const tasks = table<Task>('tasks').map((t) => ({ ...t, notifId: null }));
  const logs = table<LogItem>('logs');
  const people = table<Person>('people');
  const peopleIds = new Set([...knownPeople, ...people.map((p) => p.id)]);

  // Expenses may name friends who were deleted for good; they show as "removed friend".
  const expenses = table<Expense>('expenses').filter((e) => {
    const ok = checkSplit(e) === null;
    if (!ok) skipped += 1;
    return ok;
  });
  const entries = table<Entry>('entries').filter((e) => {
    const ok = peopleIds.has(e.personId);
    if (!ok) skipped += 1;
    return ok;
  });

  const settings: Partial<PortableSettings> = {};
  if (isObject(raw.settings)) {
    for (const key of PORTABLE_KEYS) {
      const value = raw.settings[key];
      if (value !== undefined && SETTING_CHECKS[key](value)) {
        (settings as Record<string, unknown>)[key] = value;
      }
    }
  }

  return {
    ok: true,
    data: { notes, tasks, logs, people, entries, expenses },
    settings,
    exportedAt: stamp(raw.exportedAt) ? (raw.exportedAt as number) : 0,
    skipped,
  };
}

export function backupFileName(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `daybook-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

export function countRecords(data: BackupData): number {
  return (
    data.notes.length +
    data.tasks.length +
    data.logs.length +
    data.people.length +
    data.entries.length +
    data.expenses.length
  );
}
