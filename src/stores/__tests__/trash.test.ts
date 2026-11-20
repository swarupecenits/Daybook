import { entriesTable, logsTable, notesTable } from '@/db/repos';
import { trashItems } from '@/lib/trash';
import { currentData } from '@/stores/backup';
import { type ExpenseDraft, useLedger } from '@/stores/ledger';
import { useLogs } from '@/stores/logs';
import { useNotes } from '@/stores/notes';
import { useTasks } from '@/stores/tasks';
import { destroyItem, emptyTrash, restoreItem } from '@/stores/trash';
import { freshDevice } from '@/test/device';

const ledger = () => useLedger.getState();
const notes = () => useNotes.getState();
const listed = () => trashItems(currentData(), Date.now()).map((i) => [i.kind, i.title]);

const dinnerWith = (personId: string): ExpenseDraft => ({
  title: 'Dinner',
  amount: 60_000,
  share: 30_000,
  category: 'food',
  method: 'upi',
  date: '2026-03-08',
  note: '',
  paidBy: 'me',
  split: [{ personId, amount: 30_000 }],
});

beforeEach(async () => {
  await freshDevice();
});

it('lists what can come back on its own, newest first', () => {
  const aarav = ledger().addPerson({ name: 'Aarav' })!;
  const bela = ledger().addPerson({ name: 'Bela' })!;
  const cab = ledger().addEntry({ personId: aarav.id, kind: 'gave', amount: 10_000, note: 'Cab', date: '2026-03-09' })!;
  ledger().addEntry({ personId: bela.id, kind: 'gave', amount: 5_000, note: '', date: '2026-03-09' });
  ledger().addEntry({ personId: bela.id, kind: 'got', amount: 2_000, note: '', date: '2026-03-09' });
  const dinner = ledger().saveExpense(null, dinnerWith(bela.id))!;
  const idea = notes().create({ title: 'Ideas' })!;
  const blank = notes().create()!;

  ledger().removeEntry(cab.id);
  ledger().removeExpense(dinner.id);
  ledger().removePerson(bela.id);
  notes().remove(idea.id);
  notes().remove(blank.id);

  const items = trashItems(currentData(), Date.now());
  expect(items.map((i) => [i.kind, i.title])).toEqual([
    ['note', 'Ideas'],
    ['person', 'Bela'],
    ['expense', 'Dinner'],
    ['entry', 'Aarav'],
  ]);
  // Bela's own rows come back with her; her share of dinner waits for the bill.
  expect(items[1]).toMatchObject({ entries: 2, balance: 3_000 });
});

it('restores a friend first, then the rows that were trashed before them', () => {
  const aarav = ledger().addPerson({ name: 'Aarav' })!;
  const cab = ledger().addEntry({ personId: aarav.id, kind: 'gave', amount: 10_000, note: 'Cab', date: '2026-03-09' })!;
  ledger().removeEntry(cab.id);
  ledger().removePerson(aarav.id);
  expect(listed()).toEqual([['person', 'Aarav']]);

  expect(restoreItem({ kind: 'entry', id: cab.id })).toBe(false);
  expect(restoreItem({ kind: 'person', id: aarav.id })).toBe(true);
  expect(listed()).toEqual([['entry', 'Aarav']]);
  expect(restoreItem({ kind: 'entry', id: cab.id })).toBe(true);
  expect(listed()).toEqual([]);
});

it('only deletes for good what is in the trash', async () => {
  const task = useTasks.getState().create({ title: 'Call the bank' })!;
  const log = useLogs.getState().add('Shipped the release')!;
  expect(destroyItem({ kind: 'task', id: task.id })).toBe(false);
  expect(useTasks.getState().tasks).toHaveLength(1);

  useLogs.getState().remove(log.id);
  expect(destroyItem({ kind: 'log', id: log.id })).toBe(true);
  expect(destroyItem({ kind: 'log', id: log.id })).toBe(false);
  expect(useLogs.getState().logs).toEqual([]);
  expect(await logsTable.loadAll()).toEqual([]);
});

it('empties the whole trash at once and keeps everything live', async () => {
  const aarav = ledger().addPerson({ name: 'Aarav' })!;
  const bela = ledger().addPerson({ name: 'Bela' })!;
  ledger().addEntry({ personId: aarav.id, kind: 'gave', amount: 10_000, note: '', date: '2026-03-09' });
  const kept = ledger().addEntry({ personId: bela.id, kind: 'gave', amount: 4_000, note: '', date: '2026-03-09' })!;
  const dinner = ledger().saveExpense(null, dinnerWith(bela.id))!;
  const keep = notes().create({ title: 'Keep me' })!;
  const old = notes().create({ title: 'Old' })!;

  ledger().removePerson(aarav.id);
  ledger().removeExpense(dinner.id);
  notes().remove(old.id);

  // The note, Aarav and his row, and the dinner with Bela's share of it.
  expect(emptyTrash()).toBe(5);
  expect(listed()).toEqual([]);
  expect(notes().notes.map((n) => n.id)).toEqual([keep.id]);
  expect(ledger().people.map((p) => p.id)).toEqual([bela.id]);
  expect(ledger().entries.map((e) => e.id)).toEqual([kept.id]);
  expect(ledger().expenses).toEqual([]);
  expect((await notesTable.loadAll()).map((n) => n.id)).toEqual([keep.id]);
  expect((await entriesTable.loadAll()).map((e) => e.id)).toEqual([kept.id]);
  expect(emptyTrash()).toBe(0);
});
