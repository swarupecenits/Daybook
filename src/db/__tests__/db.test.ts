import { setDb } from '@/db/adapter';
import {
  entriesTable,
  eraseAllRows,
  expensesTable,
  loadSettingsRows,
  notesTable,
  peopleTable,
  saveSettingsRows,
  tasksTable,
} from '@/db/repos';
import { migrate, SCHEMA_VERSION } from '@/db/schema';
import type { Entry, Expense, Note, Person, Task } from '@/lib/types';
import { memoryDb } from '@/test/memory-db';

const stamp = { createdAt: 1, updatedAt: 2, deletedAt: null };
const person: Person = { id: 'p1', name: 'Aarav', phone: '', upi: '', note: '', archived: false, ...stamp };
const entry: Entry = {
  id: 'e1',
  personId: 'p1',
  kind: 'gave',
  amount: 50_000,
  note: 'Movie',
  date: '2026-03-01',
  expenseId: null,
  ...stamp,
};
const note: Note = { id: 'n1', title: 'T', body: 'B', color: 'plain', pinned: true, archived: false, ...stamp };

let mem: ReturnType<typeof memoryDb>;

beforeEach(async () => {
  mem = memoryDb();
  setDb(mem);
  await migrate(mem);
});

afterEach(async () => {
  setDb(null);
  await mem.close();
});

it('migrates once and refuses data written by a newer schema', async () => {
  expect(await migrate(mem)).toBe(SCHEMA_VERSION);
  mem.raw.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
  await expect(migrate(mem)).rejects.toThrow(/newer version/);
});

it('round-trips booleans, JSON columns and nulls', async () => {
  const task: Task = {
    id: 't1',
    title: 'Ship it',
    notes: '',
    dueDate: '2026-03-02',
    dueTime: null,
    priority: 2,
    tag: 'work',
    subtasks: [{ id: 's1', title: 'Tests', done: true }],
    repeat: 'monthly',
    anchorDay: 31,
    remind: true,
    notifId: null,
    doneAt: null,
    ...stamp,
  };
  tasksTable.save(task);
  notesTable.save(note);
  expect(await tasksTable.loadAll()).toEqual([task]);
  expect(await notesTable.loadAll()).toEqual([note]);

  const expense: Expense = {
    id: 'x1',
    title: 'Dinner',
    amount: 90_000,
    share: 30_000,
    category: 'food',
    method: 'upi',
    date: '2026-03-02',
    note: '',
    paidBy: 'me',
    split: [{ personId: 'p1', amount: 60_000 }],
    ...stamp,
  };
  expensesTable.save(expense);
  expect(await expensesTable.loadAll()).toEqual([expense]);
});

it("updates in place without cascading into a friend's ledger", async () => {
  peopleTable.save(person);
  entriesTable.save(entry);
  peopleTable.save({ ...person, name: 'Aarav S', updatedAt: 3 });
  expect(await peopleTable.loadAll()).toEqual([{ ...person, name: 'Aarav S', updatedAt: 3 }]);
  expect(await entriesTable.loadAll()).toHaveLength(1);

  peopleTable.destroy([person.id]);
  expect(await entriesTable.loadAll()).toHaveLength(0);
});

it('enforces references and amount checks', () => {
  peopleTable.save(person);
  expect(() => entriesTable.save({ ...entry, personId: 'nobody' })).toThrow();
  expect(() => entriesTable.save({ ...entry, amount: 0 })).toThrow();
  expect(() => entriesTable.save({ ...entry, kind: 'lent' as Entry['kind'] })).toThrow();
});

it('rolls a failed transaction back completely', async () => {
  expect(() =>
    mem.tx(() => {
      notesTable.save(note);
      entriesTable.save({ ...entry, personId: 'nobody' });
    }),
  ).toThrow();
  expect(await notesTable.loadAll()).toEqual([]);
});

it('keeps settings as JSON and erases every table', async () => {
  saveSettingsRows({ name: 'Swarup', budget: 500_000, lock: true });
  const rows = await loadSettingsRows();
  expect(Object.fromEntries(rows)).toEqual({ name: 'Swarup', budget: 500_000, lock: true });

  peopleTable.save(person);
  entriesTable.save(entry);
  notesTable.save(note);
  eraseAllRows();
  expect((await loadSettingsRows()).size).toBe(0);
  expect(await peopleTable.loadAll()).toEqual([]);
  expect(await notesTable.loadAll()).toEqual([]);
});
