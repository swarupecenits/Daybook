import { useLedger } from './ledger';
import { useLogs } from './logs';
import { useNotes } from './notes';
import { useTasks } from './tasks';
import { toast } from './toast';
import { addDays, formatDay, todayKey } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import type { DayKey, Task } from '@/lib/types';

// User-facing flows shared by several screens: each change gets feedback and, where it removes
// something, a one-tap undo.

const taskById = (id: string) => useTasks.getState().tasks.find((t) => t.id === id);

export function completeTask(id: string) {
  const before = taskById(id);
  if (!before || before.doneAt !== null) return;
  const next = useTasks.getState().complete(id);
  if (taskById(id)?.doneAt == null) return;
  haptic('success');
  toast({
    message: next?.dueDate ? `Done · next one ${formatDay(next.dueDate).toLowerCase()}` : 'Done',
    icon: 'check-circle',
    tone: 'success',
    action: { label: 'Undo', onPress: () => useTasks.getState().reopen(id) },
  });
}

export function reopenTask(id: string) {
  useTasks.getState().reopen(id);
  haptic('tap');
}

export function deleteTask(id: string) {
  useTasks.getState().remove(id);
  if (taskById(id)?.deletedAt == null) return;
  haptic('warning');
  toast({
    message: 'Task moved to trash',
    icon: 'trash',
    action: { label: 'Undo', onPress: () => useTasks.getState().restore(id) },
  });
}

/** Pushes a task one day: to tomorrow when it's due today or earlier, otherwise a day later. */
export function snoozeTask(id: string) {
  const task = taskById(id);
  if (!task) return;
  const today = todayKey();
  const tomorrow = addDays(today, 1);
  const prev = task.dueDate;
  const next = prev && prev >= tomorrow ? addDays(prev, 1) : tomorrow;
  useTasks.getState().update(id, { dueDate: next });
  haptic('soft');
  toast({
    message: `Moved to ${formatDay(next, today).toLowerCase()}`,
    icon: 'calendar-blank',
    action: { label: 'Undo', onPress: () => useTasks.getState().update(id, { dueDate: prev }) },
  });
}

/** Reschedules several open tasks at once, with one undo for the lot. */
export function moveTasks(ids: readonly string[], day: DayKey) {
  const before = ids
    .map((id) => taskById(id))
    .filter((t): t is Task => t !== undefined && t.doneAt === null && t.deletedAt === null && t.dueDate !== day);
  if (!before.length) return;
  for (const t of before) useTasks.getState().update(t.id, { dueDate: day });
  const label = formatDay(day).toLowerCase();
  haptic('soft');
  toast({
    message: before.length === 1 ? `Moved to ${label}` : `Moved ${before.length} tasks to ${label}`,
    icon: 'calendar-check',
    action: {
      label: 'Undo',
      onPress: () => {
        for (const t of before) useTasks.getState().update(t.id, { dueDate: t.dueDate });
      },
    },
  });
}

export function deleteNote(id: string) {
  useNotes.getState().remove(id);
  if (useNotes.getState().notes.find((n) => n.id === id)?.deletedAt == null) return;
  haptic('warning');
  toast({
    message: 'Note moved to trash',
    icon: 'trash',
    action: { label: 'Undo', onPress: () => useNotes.getState().restore(id) },
  });
}

export function setNoteArchived(id: string, archived: boolean) {
  useNotes.getState().update(id, { archived });
  haptic('soft');
  toast({
    message: archived ? 'Note archived' : 'Back in your notes',
    icon: 'archive',
    action: archived ? { label: 'Undo', onPress: () => useNotes.getState().update(id, { archived: false }) } : undefined,
  });
}

export function toggleNotePin(id: string) {
  const note = useNotes.getState().notes.find((n) => n.id === id);
  if (!note) return;
  useNotes.getState().update(id, { pinned: !note.pinned, archived: false });
  haptic('select');
}

export function deleteLog(id: string) {
  useLogs.getState().remove(id);
  if (useLogs.getState().logs.find((l) => l.id === id)?.deletedAt == null) return;
  toast({
    message: 'Log entry removed',
    icon: 'trash',
    action: { label: 'Undo', onPress: () => useLogs.getState().restore(id) },
  });
}

export function deleteEntry(id: string) {
  useLedger.getState().removeEntry(id);
  if (useLedger.getState().entries.find((e) => e.id === id)?.deletedAt == null) return;
  haptic('warning');
  toast({
    message: 'Entry moved to trash',
    icon: 'trash',
    action: { label: 'Undo', onPress: () => useLedger.getState().restoreEntry(id) },
  });
}

export function deleteExpense(id: string) {
  useLedger.getState().removeExpense(id);
  if (useLedger.getState().expenses.find((e) => e.id === id)?.deletedAt == null) return;
  haptic('warning');
  toast({
    message: 'Expense moved to trash',
    icon: 'trash',
    action: { label: 'Undo', onPress: () => useLedger.getState().restoreExpense(id) },
  });
}

export function deleteFriend(id: string) {
  useLedger.getState().removePerson(id);
  if (useLedger.getState().people.find((p) => p.id === id)?.deletedAt == null) return;
  haptic('warning');
  toast({
    message: 'Friend moved to trash',
    icon: 'trash',
    action: { label: 'Undo', onPress: () => useLedger.getState().restorePerson(id) },
  });
}
