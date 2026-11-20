import {
  entriesTable,
  expensesTable,
  loadSettingsRows,
  logsTable,
  notesTable,
  peopleTable,
  tasksTable,
} from '@/db/repos';
import { buildBackup, parseBackup } from '@/lib/backup';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { currentData, eraseEverything, mergeBackup } from '@/stores/backup';
import { useLedger } from '@/stores/ledger';
import { useLogs } from '@/stores/logs';
import { useNotes } from '@/stores/notes';
import { settingsOf, useSettings } from '@/stores/settings';
import { setTaskEffects, useTasks } from '@/stores/tasks';
import { byId, freshDevice, tick } from '@/test/device';

jest.mock('expo-file-system', () => ({ File: class {}, Directory: class {}, Paths: {} }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => false, shareAsync: async () => undefined }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: async () => ({ canceled: true, assets: null }) }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: () => undefined,
  addNotificationResponseReceivedListener: () => ({ remove: () => undefined }),
  getLastNotificationResponse: () => null,
  cancelAllScheduledNotificationsAsync: async () => undefined,
}));

const STRANGER = '99999999-9999-4999-8999-999999999999';
let seq = 0;

beforeEach(async () => {
  await freshDevice();
  setTaskEffects({
    schedule: async () => `n${++seq}`,
    cancel: async () => undefined,
    scheduled: async () => new Set<string>(),
    today: () => '2026-03-10',
  });
});

const exportText = () => buildBackup(currentData(), settingsOf(useSettings.getState()));
const parse = (text: string) => {
  const parsed = parseBackup(text, new Set(useLedger.getState().people.map((p) => p.id)));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed;
};
const linkedShape = () =>
  useLedger
    .getState()
    .entries.filter((e) => e.expenseId !== null)
    .map(({ personId, kind, amount, expenseId, deletedAt }) => ({ personId, kind, amount, expenseId, deletedAt }));

function seed() {
  useSettings.getState().update({ name: 'Swarup', theme: 'dark' });
  useNotes.getState().create({ title: 'Ideas', body: 'Ship the #daybook beta' });
  useTasks.getState().create({ title: 'Renew passport', dueDate: '2099-01-05', remind: true });
  useLogs.getState().add('Reviewed the release notes', '2026-03-10');
  const ledger = useLedger.getState();
  const a = ledger.addPerson({ name: 'Aarav' })!;
  ledger.addEntry({ personId: a.id, kind: 'gave', amount: 50_000, note: 'Loan', date: '2026-03-01' });
  ledger.saveExpense(null, {
    title: 'Dinner',
    amount: 90_000,
    share: 45_000,
    category: 'food',
    method: 'card',
    date: '2026-03-08',
    note: '',
    paidBy: 'me',
    split: [{ personId: a.id, amount: 45_000 }],
  });
}

it('restores a backup onto a new phone', async () => {
  seed();
  await tick();
  const before = currentData();
  const linkedBefore = linkedShape();
  const text = exportText();

  await freshDevice();
  expect(mergeBackup(parse(text))).toEqual({ added: 6, updated: 0, unchanged: 0, skipped: 0 });
  await tick();

  const after = currentData();
  for (const key of ['notes', 'logs', 'people', 'expenses'] as const) {
    expect(byId<{ id: string }>(after[key])).toEqual(byId<{ id: string }>(before[key]));
  }
  expect(after.tasks).toEqual([{ ...before.tasks[0], notifId: expect.any(String) }]);
  expect(after.entries.filter((e) => e.expenseId === null)).toEqual(before.entries.filter((e) => e.expenseId === null));
  expect(linkedShape()).toEqual(linkedBefore);
  expect(useSettings.getState()).toMatchObject({ name: 'Swarup', theme: 'dark' });

  // Everything is on disk too, not just in memory.
  expect(byId(await notesTable.loadAll())).toEqual(byId(after.notes));
  expect(byId(await tasksTable.loadAll())).toEqual(byId(after.tasks));
  expect(byId(await logsTable.loadAll())).toEqual(byId(after.logs));
  expect(byId(await peopleTable.loadAll())).toEqual(byId(after.people));
  expect(byId(await entriesTable.loadAll())).toEqual(byId(after.entries));
  expect(byId(await expensesTable.loadAll())).toEqual(byId(after.expenses));

  // Importing the same file again changes nothing.
  expect(mergeBackup(parse(text))).toMatchObject({ added: 0, updated: 0, unchanged: 6 });
  expect(useLedger.getState().entries).toHaveLength(2);
});

it('keeps whichever side was edited last', () => {
  const mine = useNotes.getState().create({ title: 'Mine' })!;
  const theirs = useNotes.getState().create({ title: 'Theirs' })!;
  const text = exportText();
  useNotes.getState().update(mine.id, { title: 'Mine, edited here' });

  const parsed = parse(text);
  parsed.data.notes = parsed.data.notes.map((n) =>
    n.id === theirs.id ? { ...n, title: 'Theirs, edited there', updatedAt: Date.now() } : n,
  );
  expect(mergeBackup(parsed)).toMatchObject({ added: 0, updated: 1, unchanged: 1 });

  const titles = Object.fromEntries(useNotes.getState().notes.map((n) => [n.id, n.title]));
  expect(titles).toEqual({ [mine.id]: 'Mine, edited here', [theirs.id]: 'Theirs, edited there' });
});

it('rebuilds shared bills instead of trusting their ledger rows', async () => {
  seed();
  const linkedBefore = linkedShape();
  const raw = JSON.parse(exportText());
  for (const e of raw.data.entries) if (e.expenseId) e.amount = 1;
  raw.data.entries.push({ ...raw.data.entries[0], id: STRANGER, personId: STRANGER, expenseId: null });

  await freshDevice();
  expect(mergeBackup(parse(JSON.stringify(raw)))).toMatchObject({ added: 6, skipped: 1 });
  expect(linkedShape()).toEqual(linkedBefore);
  expect((await entriesTable.loadAll()).map((e) => e.amount).sort((x, y) => x - y)).toEqual([45_000, 50_000]);
});

it('only fills in preferences this phone has not set', () => {
  useLedger.getState().addPerson({ name: 'Aarav' });
  useSettings.getState().update({ name: 'Swarup', theme: 'light' });
  const empty = { notes: [], tasks: [], logs: [], people: [], entries: [], expenses: [] };
  const text = buildBackup(empty, { ...DEFAULT_SETTINGS, name: 'Other', currency: 'USD', theme: 'dark', budget: 800_000 });

  mergeBackup(parse(text));
  expect(useSettings.getState()).toMatchObject({ name: 'Swarup', currency: 'INR', theme: 'light', budget: 800_000 });
});

it('erases every record and preference', async () => {
  seed();
  expect(await eraseEverything()).toBe(true);

  const data = currentData();
  expect(Object.values(data).every((rows) => rows.length === 0)).toBe(true);
  for (const table of [notesTable, tasksTable, logsTable, peopleTable, entriesTable, expensesTable]) {
    expect(await table.loadAll()).toEqual([]);
  }
  expect((await loadSettingsRows()).size).toBe(0);
  expect(useSettings.getState()).toMatchObject({ name: '', theme: 'system', onboarded: false });
});
