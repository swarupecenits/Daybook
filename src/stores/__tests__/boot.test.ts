import { entriesTable, expensesTable, notesTable, peopleTable, saveSettingsRows } from '@/db/repos';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { TRASH_DAYS } from '@/lib/trash';
import type { Entry, Expense, Note, Person } from '@/lib/types';
import { boot } from '@/stores/boot';
import { useLedger } from '@/stores/ledger';
import { useNotes } from '@/stores/notes';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { freshDevice } from '@/test/device';

const NOW = new Date(2026, 2, 10, 9, 0).getTime();
const ago = (days: number) => NOW - days * 86_400_000;
const old = { createdAt: ago(90), updatedAt: ago(90), deletedAt: null };

const note = (id: string, over: Partial<Note> = {}): Note => ({
  id,
  title: id,
  body: '',
  color: 'plain',
  pinned: false,
  archived: false,
  ...old,
  ...over,
});
const person = (id: string, over: Partial<Person> = {}): Person => ({
  id,
  name: id,
  phone: '',
  upi: '',
  note: '',
  archived: false,
  ...old,
  ...over,
});
const entry = (id: string, personId: string, over: Partial<Entry> = {}): Entry => ({
  id,
  personId,
  kind: 'gave',
  amount: 100,
  note: '',
  date: '2026-01-01',
  expenseId: null,
  ...old,
  ...over,
});
const expense = (id: string, over: Partial<Expense> = {}): Expense => ({
  id,
  title: 'Lunch',
  amount: 200,
  share: 100,
  category: 'food',
  method: 'cash',
  date: '2026-01-01',
  note: '',
  paidBy: 'me',
  split: [{ personId: 'kept', amount: 100 }],
  ...old,
  ...over,
});

const ids = (rows: readonly { id: string }[]) => rows.map((r) => r.id).sort();

it('empties trash older than 30 days, rows that hang off it, and never-written notes', async () => {
  const mem = await freshDevice();
  notesTable.save(note('expired', { deletedAt: ago(TRASH_DAYS + 1) }));
  notesTable.save(note('recent', { deletedAt: ago(TRASH_DAYS - 1), updatedAt: ago(1) }));
  notesTable.save(note('live', { updatedAt: ago(2) }));
  notesTable.save(note('blank', { title: '  ', body: '\n' }));
  peopleTable.save(person('gone', { deletedAt: ago(40) }));
  peopleTable.save(person('kept'));
  entriesTable.save(entry('of-gone', 'gone', { deletedAt: ago(2) }));
  expensesTable.save(expense('x', { deletedAt: ago(40) }));
  entriesTable.save(entry('of-x', 'kept', { expenseId: 'x', deletedAt: ago(5) }));
  entriesTable.save(entry('live', 'kept'));

  await boot(mem, NOW);

  expect(useNotes.getState().notes.map((n) => n.id)).toEqual(['recent', 'live']);
  expect(ids(await notesTable.loadAll())).toEqual(['live', 'recent']);
  const { people, entries, expenses } = useLedger.getState();
  expect([ids(people), ids(entries), ids(expenses)]).toEqual([['kept'], ['live'], []]);
  expect(ids(await entriesTable.loadAll())).toEqual(['live']);
  expect(await expensesTable.loadAll()).toEqual([]);
});

it('puts ledger rows back in line with their friend and expense', async () => {
  const mem = await freshDevice();
  peopleTable.save(person('trashed', { deletedAt: ago(3) }));
  peopleTable.save(person('kept'));
  expensesTable.save(expense('x', { deletedAt: ago(4) }));
  entriesTable.save(entry('orphan', 'trashed'));
  entriesTable.save(entry('linked', 'kept', { expenseId: 'x' }));

  await boot(mem, NOW);

  const stamps = Object.fromEntries(useLedger.getState().entries.map((e) => [e.id, e.deletedAt]));
  expect(stamps).toEqual({ orphan: ago(3), linked: ago(4) });
  const stored = Object.fromEntries((await entriesTable.loadAll()).map((e) => [e.id, e.deletedAt]));
  expect(stored).toEqual(stamps);
});

it('reads valid preferences and starts locked when the lock is on', async () => {
  const mem = await freshDevice();
  saveSettingsRows({ name: 'Swarup', theme: 'dark', lock: true, onboarded: true, budget: -5, lockGrace: 7 });

  await boot(mem, NOW);

  expect(useSettings.getState()).toMatchObject({
    name: 'Swarup',
    theme: 'dark',
    lock: true,
    budget: DEFAULT_SETTINGS.budget,
    lockGrace: DEFAULT_SETTINGS.lockGrace,
  });
  expect(useSession.getState().locked).toBe(true);
});
