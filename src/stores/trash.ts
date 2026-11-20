import { currentData } from './backup';
import { useLedger } from './ledger';
import { useLogs } from './logs';
import { useNotes } from './notes';
import { persist } from './persist';
import { forgetTasks, useTasks } from './tasks';
import { findById, withoutIds } from './util';
import { destroyRows } from '@/db/repos';
import { planSize, type TrashKind, trashPlan } from '@/lib/trash';

type Ref = { kind: TrashKind; id: string };

/** Where a row lives, and whether it is still there and still in the trash. */
function state({ kind, id }: Ref): 'trashed' | 'live' | 'gone' {
  const row =
    kind === 'note'
      ? findById(useNotes.getState().notes, id)
      : kind === 'task'
        ? findById(useTasks.getState().tasks, id)
        : kind === 'log'
          ? findById(useLogs.getState().logs, id)
          : kind === 'person'
            ? findById(useLedger.getState().people, id)
            : kind === 'entry'
              ? findById(useLedger.getState().entries, id)
              : findById(useLedger.getState().expenses, id);
  if (!row) return 'gone';
  return row.deletedAt === null ? 'live' : 'trashed';
}

/** Puts a row back where it came from. Friends and bills bring their ledger rows with them. */
export function restoreItem(ref: Ref): boolean {
  const ledger = useLedger.getState();
  if (ref.kind === 'note') useNotes.getState().restore(ref.id);
  else if (ref.kind === 'task') useTasks.getState().restore(ref.id);
  else if (ref.kind === 'log') useLogs.getState().restore(ref.id);
  else if (ref.kind === 'person') ledger.restorePerson(ref.id);
  else if (ref.kind === 'entry') ledger.restoreEntry(ref.id);
  else ledger.restoreExpense(ref.id);
  return state(ref) === 'live';
}

/** Deletes a trashed row for good, with the ledger rows that hang off it. */
export function destroyItem(ref: Ref): boolean {
  if (state(ref) !== 'trashed') return false;
  const ledger = useLedger.getState();
  if (ref.kind === 'note') useNotes.getState().destroy(ref.id);
  else if (ref.kind === 'task') useTasks.getState().destroy(ref.id);
  else if (ref.kind === 'log') useLogs.getState().destroy(ref.id);
  else if (ref.kind === 'person') ledger.destroyPerson(ref.id);
  else if (ref.kind === 'entry') ledger.destroyEntry(ref.id);
  else ledger.destroyExpense(ref.id);
  return state(ref) === 'gone';
}

/** Deletes everything in the trash for good in one transaction. Returns the row count, or null if it failed. */
export function emptyTrash(): number | null {
  const data = currentData();
  const plan = trashPlan(data, Infinity);
  const total = planSize(plan);
  if (!total) return 0;
  if (!persist(() => destroyRows(plan))) return null;

  const goneTasks = new Set(plan.tasks);
  forgetTasks(data.tasks.filter((t) => goneTasks.has(t.id)));
  useNotes.setState((s) => ({ notes: withoutIds(s.notes, plan.notes) }));
  useTasks.setState((s) => ({ tasks: withoutIds(s.tasks, plan.tasks) }));
  useLogs.setState((s) => ({ logs: withoutIds(s.logs, plan.logs) }));
  useLedger.setState((s) => ({
    people: withoutIds(s.people, plan.people),
    entries: withoutIds(s.entries, plan.entries),
    expenses: withoutIds(s.expenses, plan.expenses),
  }));
  return total;
}
