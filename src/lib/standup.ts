import { addDays, formatDayLong, formatTime, fromKey, timeOf } from './dates';
import { compareTasks, isOpen } from './tasks';
import type { DayKey, LogItem, Task } from './types';

export type StandupInput = {
  day: DayKey;
  logs: readonly LogItem[];
  tasks: readonly Task[];
};

export type Standup = { done: string[]; next: string[]; blockers: string[] };

const BLOCKER_TAGS = new Set(['blocked', 'blocker', 'waiting']);

export function buildStandup({ day, logs, tasks }: StandupInput): Standup {
  const start = fromKey(day).getTime();
  const end = fromKey(addDays(day, 1)).getTime();
  const tomorrow = addDays(day, 1);

  const doneItems: { at: number; text: string }[] = [];
  for (const log of logs) {
    if (log.deletedAt === null && log.day === day) doneItems.push({ at: log.createdAt, text: log.text });
  }
  for (const t of tasks) {
    if (t.deletedAt === null && t.doneAt !== null && t.doneAt >= start && t.doneAt < end) {
      doneItems.push({ at: t.doneAt, text: t.title });
    }
  }
  doneItems.sort((a, b) => a.at - b.at);

  const open = tasks.filter(isOpen);
  const next = open
    .filter((t) => t.dueDate !== null && t.dueDate <= tomorrow && !(t.tag && BLOCKER_TAGS.has(t.tag)))
    .sort((a, b) => ((a.dueDate ?? '') === (b.dueDate ?? '') ? compareTasks(a, b) : (a.dueDate ?? '') < (b.dueDate ?? '') ? -1 : 1))
    .slice(0, 10)
    .map((t) => (t.dueTime ? `${t.title} (${formatTime(t.dueTime)})` : t.title));
  const blockers = open.filter((t) => t.tag && BLOCKER_TAGS.has(t.tag)).map((t) => t.title);

  return { done: doneItems.map((d) => d.text), next, blockers };
}

export function standupText(day: DayKey, s: Standup): string {
  const section = (title: string, items: string[], empty: string) =>
    [title, ...(items.length ? items.map((i) => `\u2022 ${i}`) : [`\u2022 ${empty}`])].join('\n');
  return [
    `Standup \u00B7 ${formatDayLong(day)}`,
    section('Done', s.done, 'Nothing logged'),
    section('Next', s.next, 'Planning the day'),
    section('Blockers', s.blockers, 'None'),
  ].join('\n\n');
}

/** "10:42" prefix for log lines in plain-text exports. */
export function logStamp(log: LogItem): string {
  return formatTime(timeOf(new Date(log.createdAt)));
}
