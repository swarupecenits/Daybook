import { entriesTable, expensesTable } from '@/db/repos';
import { balances } from '@/lib/balances';
import type { Person } from '@/lib/types';
import { type ExpenseDraft, ledgerRepairs, SETTLED_NOTE, useLedger } from '@/stores/ledger';
import { freshDevice } from '@/test/device';

const ledger = () => useLedger.getState();
const balanceOf = (id: string) => balances(ledger().entries).get(id) ?? 0;
const linkedTo = (expenseId: string) => ledger().entries.filter((e) => e.expenseId === expenseId);
const consistent = () => {
  const { people, entries, expenses } = ledger();
  return ledgerRepairs(people, entries, expenses);
};

const dinner = (over: Partial<ExpenseDraft> = {}): ExpenseDraft => ({
  title: 'Dinner',
  amount: 90_000,
  share: 30_000,
  category: 'food',
  method: 'upi',
  date: '2026-03-08',
  note: '',
  paidBy: 'me',
  split: [],
  ...over,
});

let a: Person;
let b: Person;

beforeEach(async () => {
  await freshDevice();
  a = ledger().addPerson({ name: '  Aarav  ' })!;
  b = ledger().addPerson({ name: 'Bela' })!;
});

it('finds friends by name and brings archived ones back', () => {
  expect(a.name).toBe('Aarav');
  ledger().updatePerson(a.id, { archived: true });
  const found = ledger().findOrAddPerson(' aarav ')!;
  expect(found).toMatchObject({ id: a.id, archived: false });
  expect(ledger().findOrAddPerson('Chirag')!.id).not.toBe(a.id);
  expect(ledger().findOrAddPerson('   ')).toBeNull();
  expect(ledger().people).toHaveLength(3);
});

it('keeps a running balance and settles it to zero', () => {
  ledger().addEntry({ personId: a.id, kind: 'gave', amount: 50_000, note: 'Movie', date: '2026-03-01' });
  ledger().addEntry({ personId: a.id, kind: 'got', amount: 20_000, note: '', date: '2026-03-02' });
  expect(balanceOf(a.id)).toBe(30_000);
  expect(ledger().addEntry({ personId: a.id, kind: 'gave', amount: 0, note: '', date: '2026-03-02' })).toBeNull();
  expect(ledger().addEntry({ personId: 'nobody', kind: 'gave', amount: 1, note: '', date: '2026-03-02' })).toBeNull();

  expect(ledger().settle(a.id)).toMatchObject({ kind: 'got', amount: 30_000, note: SETTLED_NOTE });
  expect(balanceOf(a.id)).toBe(0);
  expect(ledger().settle(a.id)).toBeNull();
});

it('turns a bill I paid into what each friend owes, and rebuilds it on edit', async () => {
  const x = ledger().saveExpense(
    null,
    dinner({
      split: [
        { personId: a.id, amount: 30_000 },
        { personId: b.id, amount: 30_000 },
      ],
    }),
  )!;
  expect(linkedTo(x.id).map((e) => [e.personId, e.kind, e.amount, e.note])).toEqual(
    expect.arrayContaining([
      [a.id, 'gave', 30_000, 'Dinner'],
      [b.id, 'gave', 30_000, 'Dinner'],
    ]),
  );
  const aRow = linkedTo(x.id).find((e) => e.personId === a.id)!;

  ledger().saveExpense(x.id, dinner({ amount: 70_000, share: 30_000, split: [{ personId: a.id, amount: 40_000 }] }));
  expect(linkedTo(x.id)).toEqual([expect.objectContaining({ id: aRow.id, amount: 40_000 })]);
  expect(balanceOf(b.id)).toBe(0);
  expect(await entriesTable.loadAll()).toHaveLength(1);

  // A split that doesn't add up is refused and changes nothing.
  expect(ledger().saveExpense(x.id, dinner({ split: [{ personId: a.id, amount: 1 }] }))).toBeNull();
  expect(ledger().expenses[0].amount).toBe(70_000);
});

it('books my share against the friend who paid', () => {
  const x = ledger().saveExpense(
    null,
    dinner({
      paidBy: a.id,
      split: [
        { personId: a.id, amount: 30_000 },
        { personId: b.id, amount: 30_000 },
      ],
    }),
  )!;
  expect(linkedTo(x.id)).toEqual([expect.objectContaining({ personId: a.id, kind: 'got', amount: 30_000 })]);
  expect(balanceOf(a.id)).toBe(-30_000);
  expect(balanceOf(b.id)).toBe(0);
  expect(ledger().saveExpense(null, dinner({ paidBy: a.id, share: 0, split: [{ personId: a.id, amount: 90_000 }] }))).toBeNull();
});

it('moves linked rows in and out of the trash with their expense and friend', () => {
  const x = ledger().saveExpense(
    null,
    dinner({
      split: [
        { personId: a.id, amount: 30_000 },
        { personId: b.id, amount: 30_000 },
      ],
    }),
  )!;
  ledger().addEntry({ personId: a.id, kind: 'gave', amount: 10_000, note: 'Cab', date: '2026-03-09' });

  ledger().removeExpense(x.id);
  expect(balanceOf(a.id)).toBe(10_000);
  expect(balanceOf(b.id)).toBe(0);
  ledger().removePerson(a.id);
  expect(balanceOf(a.id)).toBe(0);
  expect(consistent()).toEqual([]);

  // The expense comes back, but Aarav's part waits in the trash with Aarav.
  ledger().restoreExpense(x.id);
  expect(balanceOf(b.id)).toBe(30_000);
  expect(balanceOf(a.id)).toBe(0);
  expect(consistent()).toEqual([]);

  ledger().restorePerson(a.id);
  expect(balanceOf(a.id)).toBe(40_000);
  expect(consistent()).toEqual([]);
});

it('forgets a friend for good without losing the shared expense', async () => {
  const draft = dinner({
    split: [
      { personId: a.id, amount: 30_000 },
      { personId: b.id, amount: 30_000 },
    ],
  });
  const x = ledger().saveExpense(null, draft)!;
  ledger().addEntry({ personId: a.id, kind: 'gave', amount: 10_000, note: '', date: '2026-03-09' });

  ledger().destroyPerson(a.id);
  expect(ledger().people.map((p) => p.id)).toEqual([b.id]);
  expect(ledger().entries.map((e) => e.personId)).toEqual([b.id]);
  expect(await expensesTable.loadAll()).toHaveLength(1);

  // Editing the expense later must not try to recreate rows for the missing friend.
  expect(ledger().saveExpense(x.id, { ...draft, note: 'Birthday' })).not.toBeNull();
  expect((await entriesTable.loadAll()).map((e) => e.personId)).toEqual([b.id]);
});

it('only edits linked rows through their expense', () => {
  const x = ledger().saveExpense(null, dinner({ split: [{ personId: a.id, amount: 60_000 }] }))!;
  const row = linkedTo(x.id)[0];
  ledger().updateEntry(row.id, { amount: 1 });
  ledger().removeEntry(row.id);
  expect(linkedTo(x.id)).toEqual([row]);
});
