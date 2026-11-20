import { addDays, daysInMonth, diffDays, pad, weekdayOf } from './dates';
import type { DayKey, Repeat } from './types';

function withAnchor(key: DayKey, months: number, anchorDay: number): DayKey {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7)) - 1 + months;
  const year = y + Math.floor(m / 12);
  const month = `${year}-${pad((((m % 12) + 12) % 12) + 1)}`;
  return `${month}-${pad(Math.min(anchorDay, daysInMonth(month)))}`;
}

function step(key: DayKey, repeat: Exclude<Repeat, 'none'>, anchorDay: number): DayKey {
  switch (repeat) {
    case 'daily':
      return addDays(key, 1);
    case 'weekdays': {
      const day = weekdayOf(key);
      return addDays(key, day === 5 ? 3 : day === 6 ? 2 : 1);
    }
    case 'weekly':
      return addDays(key, 7);
    case 'monthly':
      return withAnchor(key, 1, anchorDay);
    case 'yearly':
      return withAnchor(key, 12, anchorDay);
  }
}

/**
 * The next due date of a repeating task once the current one is done.
 * Overdue series skip ahead to the first occurrence after today instead of piling up.
 */
export function nextDue(due: DayKey, repeat: Repeat, anchorDay: number | null, today: DayKey): DayKey | null {
  if (repeat === 'none') return null;
  const anchor = anchorDay ?? Number(due.slice(8, 10));
  let next = step(due, repeat, anchor);
  for (let guard = 0; guard < 5000 && diffDays(today, next) <= 0; guard++) {
    next = step(next, repeat, anchor);
  }
  return next;
}
