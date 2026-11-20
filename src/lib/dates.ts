import type { DayKey, TimeKey } from './types';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

const DAY_MS = 86_400_000;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

let clock24 = false;

export function setClock24(value: boolean) {
  clock24 = value;
}

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toKey(d: Date): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(now: Date = new Date()): DayKey {
  return toKey(now);
}

function parts(key: DayKey): [number, number, number] {
  const m = DAY_RE.exec(key);
  if (!m) throw new Error(`Invalid day key: ${key}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function fromKey(key: DayKey): Date {
  const [y, m, d] = parts(key);
  return new Date(y, m - 1, d);
}

export function isDayKey(value: unknown): value is DayKey {
  if (typeof value !== 'string') return false;
  const m = DAY_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1970 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(`${m[1]}-${m[2]}`);
}

export function isTimeKey(value: unknown): value is TimeKey {
  return typeof value === 'string' && TIME_RE.test(value);
}

export function addDays(key: DayKey, n: number): DayKey {
  const [y, m, d] = parts(key);
  return toKey(new Date(y, m - 1, d + n));
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function addMonths(key: DayKey, n: number): DayKey {
  const [y, m, d] = parts(key);
  const target = new Date(y, m - 1 + n, 1);
  const month = `${target.getFullYear()}-${pad(target.getMonth() + 1)}`;
  return `${month}-${pad(Math.min(d, daysInMonth(month)))}`;
}

export function addYears(key: DayKey, n: number): DayKey {
  return addMonths(key, n * 12);
}

/** Whole days from `a` to `b` (positive when `b` is later). DST-safe. */
export function diffDays(a: DayKey, b: DayKey): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

export function weekdayOf(key: DayKey): number {
  const [y, m, d] = parts(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function startOfWeek(key: DayKey, weekStart: 0 | 1): DayKey {
  const offset = (weekdayOf(key) - weekStart + 7) % 7;
  return addDays(key, -offset);
}

export function weekDays(key: DayKey, weekStart: 0 | 1): DayKey[] {
  const start = startOfWeek(key, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthOf(key: DayKey): string {
  return key.slice(0, 7);
}

export function addMonthKey(month: string, n: number): string {
  return monthOf(addMonths(`${month}-01`, n));
}

/** Weeks of a month calendar, padded with days from adjacent months. */
export function monthGrid(month: string, weekStart: 0 | 1): DayKey[][] {
  const first = `${month}-01`;
  const start = startOfWeek(first, weekStart);
  const last = `${month}-${pad(daysInMonth(month))}`;
  const weeks: DayKey[][] = [];
  let cursor = start;
  while (weeks.length < 6 && (weeks.length === 0 || diffDays(cursor, last) >= 0)) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(cursor, i));
    weeks.push(week);
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

export function weekdayLabels(weekStart: 0 | 1): string[] {
  return Array.from({ length: 7 }, (_, i) => WEEKDAYS_SHORT[(i + weekStart) % 7]);
}

export function formatDay(key: DayKey, today: DayKey = todayKey()): string {
  const delta = diffDays(today, key);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  const [y, m, d] = parts(key);
  const base = `${WEEKDAYS_SHORT[weekdayOf(key)]}, ${d} ${MONTHS_SHORT[m - 1]}`;
  return y === parts(today)[0] ? base : `${base} ${y}`;
}

export function formatDayShort(key: DayKey, today: DayKey = todayKey()): string {
  const [y, m, d] = parts(key);
  const base = `${d} ${MONTHS_SHORT[m - 1]}`;
  return y === parts(today)[0] ? base : `${base} ${String(y).slice(2)}`;
}

export function formatDayLong(key: DayKey): string {
  const [, m, d] = parts(key);
  return `${WEEKDAYS[weekdayOf(key)]}, ${d} ${MONTHS[m - 1]}`;
}

export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function formatTime(time: TimeKey): string {
  const m = TIME_RE.exec(time);
  if (!m) return time;
  const h = Number(m[1]);
  if (clock24) return time;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m[2] === '00' ? `${h12} ${suffix}` : `${h12}:${m[2]} ${suffix}`;
}

export function timeOf(date: Date): TimeKey {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toTimestamp(day: DayKey, time: TimeKey | null): number {
  const [y, m, d] = parts(day);
  const [hh, mm] = time && isTimeKey(time) ? time.split(':').map(Number) : [0, 0];
  return new Date(y, m - 1, d, hh, mm).getTime();
}

export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Hello, night owl';
}

export function relativeTime(ts: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24 && toKey(new Date(ts)) === toKey(new Date(now))) return `${hours} h ago`;
  const days = diffDays(toKey(new Date(ts)), toKey(new Date(now)));
  if (days <= 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDayShort(toKey(new Date(ts)), toKey(new Date(now)));
}
