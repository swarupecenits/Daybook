import type { BackupData } from './backup';
import { signed } from './balances';
import { isBlank } from './notes';
import { noteTitle, snippet } from './text';
import type { CategoryId, DayKey, PaperColor } from './types';

/** Days something rests in the trash before start-up deletes it for good. */
export const TRASH_DAYS = 30;
export const DAY_MS = 86_400_000;

type Stamped = { id: string; deletedAt: number | null };

/** Row ids per table. */
export type TrashPlan = {
  notes: string[];
  tasks: string[];
  logs: string[];
  people: string[];
  expenses: string[];
  entries: string[];
};

/**
 * Rows trashed before `cutoff`, plus the ledger rows that hang off a trashed friend or expense.
 * `Infinity` covers the whole trash.
 */
export function trashPlan(data: BackupData, cutoff: number): TrashPlan {
  const expired = (x: Stamped) => x.deletedAt !== null && x.deletedAt < cutoff;
  const ids = (rows: readonly Stamped[]) => rows.filter(expired).map((x) => x.id);
  const people = new Set(ids(data.people));
  const expenses = new Set(ids(data.expenses));
  return {
    notes: ids(data.notes),
    tasks: ids(data.tasks),
    logs: ids(data.logs),
    people: [...people],
    expenses: [...expenses],
    entries: data.entries
      .filter((e) => expired(e) || people.has(e.personId) || (e.expenseId !== null && expenses.has(e.expenseId)))
      .map((e) => e.id),
  };
}

export const planSize = (plan: TrashPlan): number => Object.values(plan).reduce((n, list) => n + list.length, 0);

export function withoutPlan(data: BackupData, plan: TrashPlan): BackupData {
  const drop = <T extends { id: string }>(rows: T[], gone: string[]) => {
    if (!gone.length) return rows;
    const set = new Set(gone);
    return rows.filter((r) => !set.has(r.id));
  };
  return {
    notes: drop(data.notes, plan.notes),
    tasks: drop(data.tasks, plan.tasks),
    logs: drop(data.logs, plan.logs),
    people: drop(data.people, plan.people),
    expenses: drop(data.expenses, plan.expenses),
    entries: drop(data.entries, plan.entries),
  };
}

/** Whole days until a trashed row goes for good; 0 means at the next start-up. */
export function daysLeft(deletedAt: number, now: number): number {
  return Math.max(0, Math.ceil((deletedAt + TRASH_DAYS * DAY_MS - now) / DAY_MS));
}

type Base = { id: string; title: string; deletedAt: number; daysLeft: number };

export type TrashItem =
  | (Base & { kind: 'note'; color: PaperColor; preview: string })
  | (Base & { kind: 'task'; done: boolean; dueDate: DayKey | null })
  | (Base & { kind: 'log'; day: DayKey })
  /** `entries` and `balance` describe the ledger rows that come back with the friend. */
  | (Base & { kind: 'person'; entries: number; balance: number })
  /** `amount` is signed: positive when the friend owed me. */
  | (Base & { kind: 'entry'; personId: string; amount: number; date: DayKey; note: string })
  | (Base & { kind: 'expense'; amount: number; share: number; category: CategoryId; date: DayKey; friends: number });

export type TrashKind = TrashItem['kind'];

/**
 * What the trash screen lists, newest first: everything that can be restored on its own. Ledger rows
 * that went with a friend or a bill are folded into that friend or bill.
 */
export function trashItems(data: BackupData, now: number): TrashItem[] {
  const out: TrashItem[] = [];
  const base = (id: string, title: string, deletedAt: number): Base => ({
    id,
    title,
    deletedAt,
    daysLeft: daysLeft(deletedAt, now),
  });

  for (const n of data.notes) {
    if (n.deletedAt === null || isBlank(n)) continue;
    out.push({ kind: 'note', ...base(n.id, noteTitle(n), n.deletedAt), color: n.color, preview: snippet(n, 120) });
  }
  for (const t of data.tasks) {
    if (t.deletedAt === null) continue;
    out.push({ kind: 'task', ...base(t.id, t.title, t.deletedAt), done: t.doneAt !== null, dueDate: t.dueDate });
  }
  for (const l of data.logs) {
    if (l.deletedAt === null) continue;
    out.push({ kind: 'log', ...base(l.id, l.text, l.deletedAt), day: l.day });
  }

  const people = new Map(data.people.map((p) => [p.id, p]));
  const trashedExpense = new Set(data.expenses.filter((x) => x.deletedAt !== null).map((x) => x.id));
  const withPerson = new Map<string, { entries: number; balance: number }>();
  for (const e of data.entries) {
    if (e.deletedAt === null) continue;
    const person = people.get(e.personId);
    if (!person) continue;
    if (person.deletedAt === null) {
      if (e.expenseId === null) {
        out.push({
          kind: 'entry',
          ...base(e.id, person.name, e.deletedAt),
          personId: person.id,
          amount: signed(e),
          date: e.date,
          note: e.note,
        });
      }
      continue;
    }
    // Same stamp as the friend: it comes back with them, unless its bill is still in the trash.
    if (e.deletedAt !== person.deletedAt || (e.expenseId !== null && trashedExpense.has(e.expenseId))) continue;
    const sum = withPerson.get(person.id) ?? { entries: 0, balance: 0 };
    sum.entries += 1;
    sum.balance += signed(e);
    withPerson.set(person.id, sum);
  }
  for (const p of data.people) {
    if (p.deletedAt === null) continue;
    const sum = withPerson.get(p.id) ?? { entries: 0, balance: 0 };
    out.push({ kind: 'person', ...base(p.id, p.name, p.deletedAt), ...sum });
  }
  for (const x of data.expenses) {
    if (x.deletedAt === null) continue;
    out.push({
      kind: 'expense',
      ...base(x.id, x.title, x.deletedAt),
      amount: x.amount,
      share: x.share,
      category: x.category,
      date: x.date,
      friends: x.split.length,
    });
  }
  return out.sort((a, b) => b.deletedAt - a.deletedAt);
}
