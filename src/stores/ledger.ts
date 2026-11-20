import { create } from 'zustand';

import { persist } from './persist';
import { findById, upsertAll, upsertIn, withoutIds } from './util';
import { db } from '@/db/adapter';
import { entriesTable, expensesTable, peopleTable } from '@/db/repos';
import { balances, settlement } from '@/lib/balances';
import { category, isCategory, isMethod } from '@/lib/categories';
import { isDayKey, todayKey } from '@/lib/dates';
import { newId } from '@/lib/ids';
import { clean, LIMITS } from '@/lib/limits';
import { isValidAmount } from '@/lib/money';
import { checkSplit, linkedEntries } from '@/lib/split';
import type { CategoryId, DayKey, Entry, EntryKind, Expense, PayMethod, Person, SplitPart } from '@/lib/types';
import { normalizePhone } from '@/lib/upi';

export type PersonDraft = { name: string; phone: string; upi: string; note: string; archived: boolean };
export type EntryDraft = { personId: string; kind: EntryKind; amount: number; note: string; date: DayKey };
export type ExpenseDraft = {
  title: string;
  amount: number;
  share: number;
  category: CategoryId;
  method: PayMethod;
  date: DayKey;
  note: string;
  paidBy: string;
  split: SplitPart[];
};

export const SETTLED_NOTE = 'Settled up';

function cleanPerson(patch: Partial<PersonDraft>): Partial<PersonDraft> {
  const out: Partial<PersonDraft> = {};
  if (patch.name !== undefined) out.name = clean(patch.name.replace(/\s+/g, ' '), LIMITS.name);
  if (patch.phone !== undefined) out.phone = normalizePhone(patch.phone).slice(0, LIMITS.phone);
  if (patch.upi !== undefined) out.upi = clean(patch.upi.replace(/\s+/g, ''), LIMITS.upi);
  if (patch.note !== undefined) out.note = clean(patch.note, LIMITS.note);
  if (patch.archived !== undefined) out.archived = patch.archived === true;
  return out;
}

function cleanEntry(patch: Partial<EntryDraft>): Partial<EntryDraft> | null {
  const out: Partial<EntryDraft> = {};
  if (patch.kind !== undefined) {
    if (patch.kind !== 'gave' && patch.kind !== 'got') return null;
    out.kind = patch.kind;
  }
  if (patch.amount !== undefined) {
    if (!isValidAmount(patch.amount)) return null;
    out.amount = patch.amount;
  }
  if (patch.date !== undefined) {
    if (!isDayKey(patch.date)) return null;
    out.date = patch.date;
  }
  if (patch.note !== undefined) out.note = clean(patch.note.replace(/\s+/g, ' '), LIMITS.note);
  return out;
}

/**
 * Entries whose soft-delete state is out of line with their person or expense: a live entry must have
 * a live person, and a live linked entry a live expense. Returns the corrected rows.
 */
export function ledgerRepairs(
  people: readonly Person[],
  entries: readonly Entry[],
  expenses: readonly Expense[],
): Entry[] {
  const personDeleted = new Map(people.map((p) => [p.id, p.deletedAt]));
  const expenseDeleted = new Map(expenses.map((e) => [e.id, e.deletedAt]));
  const out: Entry[] = [];
  for (const e of entries) {
    if (e.deletedAt !== null) continue;
    const stamp = personDeleted.get(e.personId) ?? (e.expenseId ? expenseDeleted.get(e.expenseId) : null) ?? null;
    if (stamp !== null) out.push({ ...e, deletedAt: stamp });
  }
  return out;
}

/**
 * The ledger rows an expense implies, reusing ids of rows it already had so history keeps its order.
 * Friends deleted for good are skipped; rows stay in the trash while the expense or the friend is.
 */
export function rebuildLinked(
  expense: Expense,
  people: readonly Person[],
  existing: readonly Entry[],
  now: number,
): { fresh: Entry[]; stale: string[] } {
  const old = existing.filter((e) => e.expenseId === expense.id);
  const oldByPerson = new Map(old.map((e) => [e.personId, e]));
  const fresh: Entry[] = [];
  for (const link of linkedEntries(expense)) {
    const person = findById(people, link.personId);
    if (!person) continue;
    const reuse = oldByPerson.get(link.personId);
    fresh.push({
      ...link,
      id: reuse?.id ?? newId(),
      createdAt: reuse?.createdAt ?? now,
      updatedAt: now,
      deletedAt: expense.deletedAt ?? person.deletedAt,
    });
  }
  const kept = new Set(fresh.map((e) => e.id));
  return { fresh, stale: old.filter((e) => !kept.has(e.id)).map((e) => e.id) };
}

type LedgerState = {
  people: Person[];
  entries: Entry[];
  expenses: Expense[];

  addPerson(draft: Partial<PersonDraft> & { name: string }): Person | null;
  updatePerson(id: string, patch: Partial<PersonDraft>): void;
  /** Case-insensitive lookup among friends; creates one when nobody matches. */
  findOrAddPerson(name: string): Person | null;
  removePerson(id: string): void;
  restorePerson(id: string): void;
  destroyPerson(id: string): void;

  addEntry(draft: EntryDraft): Entry | null;
  /** Only standalone entries; linked ones change through their expense. */
  updateEntry(id: string, patch: Partial<Omit<EntryDraft, 'personId'>>): void;
  removeEntry(id: string): void;
  restoreEntry(id: string): void;
  destroyEntry(id: string): void;
  /** Records the payment that brings a friend's balance to zero. */
  settle(personId: string): Entry | null;

  saveExpense(id: string | null, draft: ExpenseDraft): Expense | null;
  removeExpense(id: string): void;
  restoreExpense(id: string): void;
  destroyExpense(id: string): void;
};

export const useLedger = create<LedgerState>()((set, get) => {
  /** Writes rows in one transaction and mirrors them into memory. */
  const commit = (changes: { people?: Person[]; entries?: Entry[]; expenses?: Expense[] }): boolean => {
    const ok = persist(() =>
      db().tx(() => {
        for (const p of changes.people ?? []) peopleTable.save(p);
        for (const e of changes.expenses ?? []) expensesTable.save(e);
        for (const e of changes.entries ?? []) entriesTable.save(e);
      }),
    );
    if (!ok) return false;
    const s = get();
    set({
      people: changes.people ? upsertAll(s.people, changes.people) : s.people,
      entries: changes.entries ? upsertAll(s.entries, changes.entries) : s.entries,
      expenses: changes.expenses ? upsertAll(s.expenses, changes.expenses) : s.expenses,
    });
    return true;
  };

  const livePerson = (id: string) => {
    const p = findById(get().people, id);
    return p && p.deletedAt === null ? p : undefined;
  };

  return {
    people: [],
    entries: [],
    expenses: [],

    addPerson(draft) {
      const clean = cleanPerson(draft);
      if (!clean.name) return null;
      const now = Date.now();
      const person: Person = {
        id: newId(),
        name: clean.name,
        phone: '',
        upi: '',
        note: '',
        archived: false,
        ...clean,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      return commit({ people: [person] }) ? person : null;
    },

    updatePerson(id, patch) {
      const prev = livePerson(id);
      if (!prev) return;
      const clean = cleanPerson(patch);
      if (clean.name === '') delete clean.name;
      const keys = Object.keys(clean) as (keyof PersonDraft)[];
      if (keys.every((k) => clean[k] === prev[k])) return;
      commit({ people: [{ ...prev, ...clean, updatedAt: Date.now() }] });
    },

    findOrAddPerson(name) {
      const wanted = clean(name.replace(/\s+/g, ' '), LIMITS.name);
      if (!wanted) return null;
      const key = wanted.toLocaleLowerCase();
      const match = get().people.find((p) => p.deletedAt === null && p.name.toLocaleLowerCase() === key);
      if (!match) return get().addPerson({ name: wanted });
      if (match.archived) get().updatePerson(match.id, { archived: false });
      return findById(get().people, match.id) ?? match;
    },

    removePerson(id) {
      const prev = livePerson(id);
      if (!prev) return;
      const now = Date.now();
      const entries = get()
        .entries.filter((e) => e.personId === id && e.deletedAt === null)
        .map((e) => ({ ...e, deletedAt: now, updatedAt: now }));
      commit({ people: [{ ...prev, deletedAt: now, updatedAt: now }], entries });
    },

    restorePerson(id) {
      const prev = findById(get().people, id);
      if (!prev || prev.deletedAt === null) return;
      const stamp = prev.deletedAt;
      const now = Date.now();
      const expenses = get().expenses;
      const entries = get()
        .entries.filter((e) => e.personId === id && e.deletedAt === stamp)
        .map((e) => {
          // An entry whose expense is still in the trash goes back with that expense instead.
          const expense = e.expenseId ? findById(expenses, e.expenseId) : undefined;
          return { ...e, deletedAt: expense?.deletedAt ?? null, updatedAt: now };
        });
      commit({ people: [{ ...prev, deletedAt: null, updatedAt: now }], entries });
    },

    destroyPerson(id) {
      const entryIds = get()
        .entries.filter((e) => e.personId === id)
        .map((e) => e.id);
      const ok = persist(() =>
        db().tx(() => {
          entriesTable.destroy(entryIds);
          peopleTable.destroy([id]);
        }),
      );
      if (!ok) return;
      const s = get();
      set({ people: withoutIds(s.people, [id]), entries: withoutIds(s.entries, entryIds) });
    },

    addEntry(draft) {
      const person = livePerson(draft.personId);
      const clean = cleanEntry({ ...draft, date: draft.date || todayKey() });
      if (!person || !clean || !clean.kind || !clean.amount || !clean.date) return null;
      const now = Date.now();
      const entry: Entry = {
        id: newId(),
        personId: person.id,
        kind: clean.kind,
        amount: clean.amount,
        note: clean.note ?? '',
        date: clean.date,
        expenseId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      return commit({ entries: [entry] }) ? entry : null;
    },

    updateEntry(id, patch) {
      const prev = findById(get().entries, id);
      if (!prev || prev.deletedAt !== null || prev.expenseId !== null) return;
      const clean = cleanEntry(patch);
      if (!clean) return;
      const keys = Object.keys(clean) as (keyof typeof clean)[];
      if (keys.every((k) => clean[k] === prev[k])) return;
      commit({ entries: [{ ...prev, ...clean, updatedAt: Date.now() }] });
    },

    removeEntry(id) {
      const prev = findById(get().entries, id);
      if (!prev || prev.deletedAt !== null || prev.expenseId !== null) return;
      const now = Date.now();
      commit({ entries: [{ ...prev, deletedAt: now, updatedAt: now }] });
    },

    restoreEntry(id) {
      const prev = findById(get().entries, id);
      if (!prev || prev.deletedAt === null || prev.expenseId !== null || !livePerson(prev.personId)) return;
      commit({ entries: [{ ...prev, deletedAt: null, updatedAt: Date.now() }] });
    },

    destroyEntry(id) {
      if (!persist(() => entriesTable.destroy([id]))) return;
      set({ entries: withoutIds(get().entries, [id]) });
    },

    settle(personId) {
      const balance = balances(get().entries).get(personId) ?? 0;
      const plan = settlement(balance);
      if (!plan) return null;
      return get().addEntry({ personId, ...plan, note: SETTLED_NOTE, date: todayKey() });
    },

    saveExpense(id, draft) {
      const s = get();
      const prev = id ? findById(s.expenses, id) : undefined;
      if (id && (!prev || prev.deletedAt !== null)) return null;
      if (!isCategory(draft.category) || !isMethod(draft.method) || !isDayKey(draft.date)) return null;
      if (!isValidAmount(draft.amount)) return null;
      const now = Date.now();
      const expense: Expense = {
        id: prev?.id ?? newId(),
        title: clean(draft.title.replace(/\s+/g, ' '), LIMITS.title) || category(draft.category).label,
        amount: draft.amount,
        share: draft.share,
        category: draft.category,
        method: draft.method,
        date: draft.date,
        note: clean(draft.note, LIMITS.note),
        paidBy: draft.paidBy,
        split: draft.split.map((p) => ({ personId: p.personId, amount: p.amount })),
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      };
      if (checkSplit(expense) !== null) return null;

      const { fresh, stale } = rebuildLinked(expense, s.people, s.entries, now);
      const ok = persist(() =>
        db().tx(() => {
          expensesTable.save(expense);
          entriesTable.destroy(stale);
          for (const e of fresh) entriesTable.save(e);
        }),
      );
      if (!ok) return null;
      set({
        expenses: upsertIn(s.expenses, expense),
        entries: upsertAll(withoutIds(s.entries, stale), fresh),
      });
      return expense;
    },

    removeExpense(id) {
      const prev = findById(get().expenses, id);
      if (!prev || prev.deletedAt !== null) return;
      const now = Date.now();
      const entries = get()
        .entries.filter((e) => e.expenseId === id && e.deletedAt === null)
        .map((e) => ({ ...e, deletedAt: now, updatedAt: now }));
      commit({ expenses: [{ ...prev, deletedAt: now, updatedAt: now }], entries });
    },

    restoreExpense(id) {
      const prev = findById(get().expenses, id);
      if (!prev || prev.deletedAt === null) return;
      const stamp = prev.deletedAt;
      const now = Date.now();
      const people = get().people;
      const entries = get()
        .entries.filter((e) => e.expenseId === id && e.deletedAt === stamp)
        .map((e) => ({ ...e, deletedAt: findById(people, e.personId)?.deletedAt ?? null, updatedAt: now }));
      commit({ expenses: [{ ...prev, deletedAt: null, updatedAt: now }], entries });
    },

    destroyExpense(id) {
      const entryIds = get()
        .entries.filter((e) => e.expenseId === id)
        .map((e) => e.id);
      const ok = persist(() =>
        db().tx(() => {
          entriesTable.destroy(entryIds);
          expensesTable.destroy([id]);
        }),
      );
      if (!ok) return;
      const s = get();
      set({ expenses: withoutIds(s.expenses, [id]), entries: withoutIds(s.entries, entryIds) });
    },
  };
});
