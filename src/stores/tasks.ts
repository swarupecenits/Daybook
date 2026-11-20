import { create } from 'zustand';

import { persist } from './persist';
import { findById, upsertIn, withoutIds } from './util';
import { db } from '@/db/adapter';
import { tasksTable } from '@/db/repos';
import { formatTime, isDayKey, isTimeKey, todayKey, toTimestamp } from '@/lib/dates';
import { newId } from '@/lib/ids';
import { clean, clip, LIMITS } from '@/lib/limits';
import { cancelReminder, scheduledReminderIds, scheduleReminder, type ReminderRequest } from '@/lib/reminders';
import { nextDue } from '@/lib/repeat';
import type { DayKey, Priority, Repeat, Subtask, Task, TimeKey } from '@/lib/types';

export type TaskDraft = {
  title: string;
  notes: string;
  dueDate: DayKey | null;
  dueTime: TimeKey | null;
  priority: Priority;
  tag: string | null;
  subtasks: Subtask[];
  repeat: Repeat;
  remind: boolean;
};

export type TaskEffects = {
  schedule(req: ReminderRequest): Promise<string | null>;
  cancel(id: string): Promise<void>;
  scheduled(): Promise<Set<string> | null>;
  today(): DayKey;
};

let effects: TaskEffects = {
  schedule: scheduleReminder,
  cancel: cancelReminder,
  scheduled: scheduledReminderIds,
  today: () => todayKey(),
};

/** Swaps side effects (notifications, clock) — used by tests. */
export function setTaskEffects(next: Partial<TaskEffects>) {
  effects = { ...effects, ...next };
}

export const DEFAULT_REMINDER_TIME = '09:00';
const REPEATS: readonly Repeat[] = ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly'];

export function normalizeTag(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const t = tag
    .replace(/^#+/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s#]+/g, '-');
  return t ? clip(t, LIMITS.tag) : null;
}

function sanitize(patch: Partial<TaskDraft>): Partial<TaskDraft> {
  const out: Partial<TaskDraft> = {};
  if (patch.title !== undefined) out.title = clean(patch.title.replace(/\s+/g, ' '), LIMITS.title);
  if (patch.notes !== undefined) out.notes = clip(patch.notes.replace(/\u0000/g, ''), LIMITS.taskNotes);
  if (patch.dueDate !== undefined) out.dueDate = isDayKey(patch.dueDate) ? patch.dueDate : null;
  if (patch.dueTime !== undefined) out.dueTime = isTimeKey(patch.dueTime) ? patch.dueTime : null;
  if (patch.priority !== undefined && [0, 1, 2, 3].includes(patch.priority)) out.priority = patch.priority;
  if (patch.tag !== undefined) out.tag = normalizeTag(patch.tag);
  if (patch.subtasks !== undefined) {
    out.subtasks = patch.subtasks
      .map((s) => ({ id: s.id || newId(), title: clean(s.title, LIMITS.title), done: s.done === true }))
      .filter((s) => s.title.length > 0)
      .slice(0, LIMITS.subtasks);
  }
  if (patch.repeat !== undefined && REPEATS.includes(patch.repeat)) out.repeat = patch.repeat;
  if (patch.remind !== undefined) out.remind = patch.remind;
  return out;
}

/** A series needs a start date, and a time without a date means nothing. */
function settle(t: Task): Task {
  let next = t;
  if (next.repeat !== 'none' && !next.dueDate) next = { ...next, dueDate: effects.today() };
  if (!next.dueDate && (next.dueTime || next.remind)) next = { ...next, dueTime: null, remind: false };
  return next;
}

// ---------------------------------------------------------------------------------------------
// Reminders. Each task's notification is re-planned after every change; a version counter makes
// sure a slow `schedule` that finishes after a newer edit gets cancelled instead of kept.

type Plan = { at: number; title: string; body: string };

export function reminderPlan(t: Task, now: number = Date.now()): Plan | null {
  if (!t.remind || t.doneAt !== null || t.deletedAt !== null || !t.dueDate) return null;
  const at = toTimestamp(t.dueDate, t.dueTime ?? DEFAULT_REMINDER_TIME);
  if (!Number.isFinite(at) || at <= now + 5_000) return null;
  return { at, title: t.title, body: t.dueTime ? `Due at ${formatTime(t.dueTime)}` : 'Due today' };
}

const planKey = (p: Plan) => `${p.at}|${p.title}|${p.body}`;
const versions = new Map<string, number>();
const scheduledKeys = new Map<string, string>();
/** Repeating tasks spawn their next occurrence on completion; remembered so reopening undoes it. */
const spawnedBy = new Map<string, string>();

function bump(id: string): number {
  const v = (versions.get(id) ?? 0) + 1;
  versions.set(id, v);
  return v;
}

function writeNotifId(id: string, notifId: string | null) {
  const { tasks } = useTasks.getState();
  const t = findById(tasks, id);
  if (!t || t.notifId === notifId) return;
  const next = { ...t, notifId };
  if (!persist(() => tasksTable.save(next))) return;
  useTasks.setState({ tasks: upsertIn(useTasks.getState().tasks, next) });
}

/** Cancels whatever is scheduled for a task that is about to disappear. */
function dropReminder(t: Task) {
  bump(t.id);
  scheduledKeys.delete(t.id);
  if (t.notifId) void effects.cancel(t.notifId);
}

function syncReminder(id: string) {
  const t = findById(useTasks.getState().tasks, id);
  if (!t) return;
  const plan = reminderPlan(t);
  const key = plan ? planKey(plan) : null;
  if (key && t.notifId && scheduledKeys.get(id) === key) return;
  if (!key && !t.notifId) return;
  const version = bump(id);
  if (t.notifId) {
    void effects.cancel(t.notifId);
    writeNotifId(id, null);
  }
  scheduledKeys.delete(id);
  if (!plan || !key) return;
  void effects.schedule({ taskId: id, ...plan }).then((notifId) => {
    if (!notifId) return;
    if (versions.get(id) !== version) {
      void effects.cancel(notifId);
      return;
    }
    scheduledKeys.set(id, key);
    writeNotifId(id, notifId);
  });
}

/** Startup / post-import pass: re-queue missing reminders, forget fired ones, cancel orphans. */
export async function reconcileReminders(): Promise<void> {
  const tasks = useTasks.getState().tasks;
  if (!tasks.some((t) => t.notifId || reminderPlan(t))) return;
  const scheduled = await effects.scheduled();
  if (!scheduled) return;
  const keep = new Set<string>();
  for (const t of useTasks.getState().tasks) {
    const plan = reminderPlan(t);
    if (plan && t.notifId && scheduled.has(t.notifId)) {
      keep.add(t.notifId);
      scheduledKeys.set(t.id, planKey(plan));
    } else if (plan) {
      if (t.notifId) writeNotifId(t.id, null);
      syncReminder(t.id);
    } else if (t.notifId) {
      writeNotifId(t.id, null);
    }
  }
  for (const id of scheduled) if (!keep.has(id)) void effects.cancel(id);
}

/** After rows were replaced wholesale (import): cancel what the old versions scheduled, then re-plan. */
export function afterTasksReplaced(previous: readonly Task[], ids: Iterable<string>) {
  const before = new Map(previous.map((t) => [t.id, t]));
  for (const id of ids) {
    const old = before.get(id);
    if (old) dropReminder(old);
    syncReminder(id);
  }
}

/** Forgets in-memory reminder and repeat bookkeeping (after erasing everything). */
export function resetTaskRuntime() {
  versions.clear();
  scheduledKeys.clear();
  spawnedBy.clear();
}

/** After tasks were deleted for good in bulk: cancel their reminders and forget their bookkeeping. */
export function forgetTasks(gone: readonly Task[]) {
  for (const t of gone) {
    dropReminder(t);
    spawnedBy.delete(t.id);
  }
}

// ---------------------------------------------------------------------------------------------

type TasksState = {
  tasks: Task[];
  create(draft: Partial<TaskDraft> & { title: string }): Task | null;
  update(id: string, patch: Partial<TaskDraft>): void;
  /** Returns the next occurrence when the task repeats. */
  complete(id: string): Task | null;
  reopen(id: string): void;
  toggleSubtask(id: string, subtaskId: string): void;
  remove(id: string): void;
  restore(id: string): void;
  destroy(id: string): void;
};

export const useTasks = create<TasksState>()((set, get) => {
  const write = (next: Task): boolean => {
    if (!persist(() => tasksTable.save(next))) return false;
    set({ tasks: upsertIn(get().tasks, next) });
    syncReminder(next.id);
    return true;
  };

  return {
    tasks: [],

    create(draft) {
      const clean = sanitize(draft);
      if (!clean.title) return null;
      const now = Date.now();
      const task = settle({
        id: newId(),
        title: clean.title,
        notes: '',
        dueDate: null,
        dueTime: null,
        priority: 0,
        tag: null,
        subtasks: [],
        repeat: 'none',
        remind: false,
        ...clean,
        anchorDay: null,
        notifId: null,
        doneAt: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      return write(task) ? task : null;
    },

    update(id, patch) {
      const prev = findById(get().tasks, id);
      if (!prev) return;
      const clean = sanitize(patch);
      if (clean.title === '') delete clean.title;
      const dateMoved = clean.dueDate !== undefined && clean.dueDate !== prev.dueDate;
      const next = settle({
        ...prev,
        ...clean,
        anchorDay: dateMoved ? null : prev.anchorDay,
        updatedAt: Date.now(),
      });
      write(next);
    },

    complete(id) {
      const { tasks } = get();
      const t = findById(tasks, id);
      if (!t || t.doneAt !== null || t.deletedAt !== null) return null;
      const now = Date.now();
      const done: Task = { ...t, doneAt: now, updatedAt: now };
      let spawned: Task | null = null;
      if (t.repeat !== 'none' && t.dueDate) {
        const anchorDay =
          t.anchorDay ?? (t.repeat === 'monthly' || t.repeat === 'yearly' ? Number(t.dueDate.slice(8, 10)) : null);
        const due = nextDue(t.dueDate, t.repeat, anchorDay, effects.today());
        if (due) {
          spawned = {
            ...t,
            id: newId(),
            dueDate: due,
            anchorDay,
            subtasks: t.subtasks.map((s) => ({ ...s, done: false })),
            notifId: null,
            doneAt: null,
            createdAt: now,
            updatedAt: now,
          };
        }
      }
      const ok = persist(() =>
        db().tx(() => {
          tasksTable.save(done);
          if (spawned) tasksTable.save(spawned);
        }),
      );
      if (!ok) return null;
      let nextTasks = upsertIn(tasks, done);
      if (spawned) {
        nextTasks = [spawned, ...nextTasks];
        spawnedBy.set(id, spawned.id);
      }
      set({ tasks: nextTasks });
      syncReminder(id);
      if (spawned) syncReminder(spawned.id);
      return spawned;
    },

    reopen(id) {
      const { tasks } = get();
      const t = findById(tasks, id);
      if (!t || t.doneAt === null) return;
      const spawnId = spawnedBy.get(id);
      const spawn = spawnId ? findById(tasks, spawnId) : undefined;
      const dropSpawn =
        spawn !== undefined && spawn.doneAt === null && spawn.deletedAt === null && spawn.updatedAt === spawn.createdAt;
      const next: Task = { ...t, doneAt: null, updatedAt: Date.now() };
      const ok = persist(() =>
        db().tx(() => {
          tasksTable.save(next);
          if (dropSpawn) tasksTable.destroy([spawn.id]);
        }),
      );
      if (!ok) return;
      spawnedBy.delete(id);
      if (dropSpawn) dropReminder(spawn);
      set({ tasks: upsertIn(dropSpawn ? withoutIds(tasks, [spawn.id]) : tasks, next) });
      syncReminder(id);
    },

    toggleSubtask(id, subtaskId) {
      const t = findById(get().tasks, id);
      if (!t) return;
      const subtasks = t.subtasks.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s));
      write({ ...t, subtasks, updatedAt: Date.now() });
    },

    remove(id) {
      const t = findById(get().tasks, id);
      if (!t || t.deletedAt !== null) return;
      const now = Date.now();
      write({ ...t, deletedAt: now, updatedAt: now });
    },

    restore(id) {
      const t = findById(get().tasks, id);
      if (!t || t.deletedAt === null) return;
      write({ ...t, deletedAt: null, updatedAt: Date.now() });
    },

    destroy(id) {
      const t = findById(get().tasks, id);
      if (!t) return;
      if (!persist(() => tasksTable.destroy([id]))) return;
      dropReminder(t);
      spawnedBy.delete(id);
      set({ tasks: withoutIds(get().tasks, [id]) });
    },
  };
});
