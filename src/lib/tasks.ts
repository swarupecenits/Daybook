import { addDays, diffDays } from './dates';
import type { DayKey, Task } from './types';

export function isOpen(t: Task): boolean {
  return t.deletedAt === null && t.doneAt === null;
}

/** Priority first, then timed before untimed (earliest first), then oldest first. */
export function compareTasks(a: Task, b: Task): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  if (a.dueTime !== b.dueTime) {
    if (a.dueTime === null) return 1;
    if (b.dueTime === null) return -1;
    return a.dueTime < b.dueTime ? -1 : 1;
  }
  return a.createdAt - b.createdAt;
}

function byDueThenPriority(a: Task, b: Task): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return compareTasks(a, b);
}

export function isOverdue(t: Task, today: DayKey): boolean {
  return isOpen(t) && t.dueDate !== null && t.dueDate < today;
}

/** Due today with a time that has already passed. */
export function isLate(t: Task, today: DayKey, now: string): boolean {
  return isOpen(t) && t.dueDate === today && t.dueTime !== null && t.dueTime < now;
}

export type TodayBuckets = { overdue: Task[]; today: Task[] };

export function todayBuckets(tasks: readonly Task[], today: DayKey): TodayBuckets {
  const overdue: Task[] = [];
  const due: Task[] = [];
  for (const t of tasks) {
    if (!isOpen(t) || t.dueDate === null) continue;
    if (t.dueDate < today) overdue.push(t);
    else if (t.dueDate === today) due.push(t);
  }
  return { overdue: overdue.sort(byDueThenPriority), today: due.sort(compareTasks) };
}

export type DayGroup<T> = { day: DayKey; items: T[] };

export function upcomingGroups(tasks: readonly Task[], today: DayKey): DayGroup<Task>[] {
  const future = tasks.filter((t) => isOpen(t) && t.dueDate !== null && t.dueDate > today).sort(byDueThenPriority);
  const groups: DayGroup<Task>[] = [];
  for (const t of future) {
    const last = groups[groups.length - 1];
    if (last && last.day === t.dueDate) last.items.push(t);
    else groups.push({ day: t.dueDate as DayKey, items: [t] });
  }
  return groups;
}

export function anytimeTasks(tasks: readonly Task[]): Task[] {
  return tasks.filter((t) => isOpen(t) && t.dueDate === null).sort(compareTasks);
}

export function doneTasks(tasks: readonly Task[]): Task[] {
  return tasks
    .filter((t) => t.deletedAt === null && t.doneAt !== null)
    .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
}

export function doneBetween(tasks: readonly Task[], start: number, end: number): Task[] {
  return tasks
    .filter((t) => t.deletedAt === null && t.doneAt !== null && t.doneAt >= start && t.doneAt < end)
    .sort((a, b) => (a.doneAt ?? 0) - (b.doneAt ?? 0));
}

export type TaskCounts = { overdue: number; today: number; upcoming: number; anytime: number; week: number };

export function taskCounts(tasks: readonly Task[], today: DayKey): TaskCounts {
  const weekEnd = addDays(today, 7);
  const counts: TaskCounts = { overdue: 0, today: 0, upcoming: 0, anytime: 0, week: 0 };
  for (const t of tasks) {
    if (!isOpen(t)) continue;
    if (t.dueDate === null) counts.anytime += 1;
    else if (t.dueDate < today) counts.overdue += 1;
    else if (t.dueDate === today) counts.today += 1;
    else {
      counts.upcoming += 1;
      if (t.dueDate <= weekEnd) counts.week += 1;
    }
  }
  return counts;
}

/** Open tasks per day, for the week strip dots. */
export function loadByDay(tasks: readonly Task[], days: readonly DayKey[]): Map<DayKey, number> {
  const set = new Set(days);
  const map = new Map<DayKey, number>();
  for (const t of tasks) {
    if (!isOpen(t) || t.dueDate === null || !set.has(t.dueDate)) continue;
    map.set(t.dueDate, (map.get(t.dueDate) ?? 0) + 1);
  }
  return map;
}

export function taskTags(tasks: readonly Task[]): string[] {
  const set = new Set<string>();
  for (const t of tasks) if (isOpen(t) && t.tag) set.add(t.tag);
  return [...set].sort();
}

export function dueLabelTone(t: Task, today: DayKey): 'overdue' | 'today' | 'soon' | 'later' | null {
  if (t.dueDate === null) return null;
  const delta = diffDays(today, t.dueDate);
  if (delta < 0) return 'overdue';
  if (delta === 0) return 'today';
  if (delta <= 2) return 'soon';
  return 'later';
}
