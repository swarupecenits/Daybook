import { addDays, addMonths, daysInMonth, diffDays, formatDay, formatTime, pad, startOfWeek, weekdayOf } from './dates';
import type { DayKey, Priority, Repeat, TimeKey } from './types';

export type ChipKind = 'date' | 'time' | 'priority' | 'tag' | 'repeat';

export type ParsedTask = {
  title: string;
  dueDate: DayKey | null;
  dueTime: TimeKey | null;
  priority: Priority;
  tag: string | null;
  repeat: Repeat;
  chips: { kind: ChipKind; label: string }[];
};

export type ParseOptions = {
  today: DayKey;
  /** Current wall-clock time, used to decide whether a bare time means today or tomorrow. */
  now: TimeKey;
  weekStart?: 0 | 1;
  ignore?: ReadonlySet<ChipKind>;
};

const START = '(^|\\s)';
const END = '(?=$|\\s|[,.;!?])';

const WEEKDAY_FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_ABBR: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  tues: 2,
  wed: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  fri: 5,
  sat: 6,
};
const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6,
  june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};
const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10,
};
const PART_OF_DAY: Record<string, TimeKey> = {
  morning: '09:00',
  afternoon: '14:00',
  evening: '18:00',
  night: '21:00',
  tonight: '20:00',
};

const REPEAT_LABEL: Record<Exclude<Repeat, 'none'>, string> = {
  daily: 'Every day',
  weekdays: 'Weekdays',
  weekly: 'Every week',
  monthly: 'Every month',
  yearly: 'Every year',
};
const PRIORITY_LABEL: Record<Exclude<Priority, 0>, string> = { 1: 'Low', 2: 'Medium', 3: 'High' };
const PRIORITY_WORDS: Record<string, Priority> = {
  low: 1,
  lo: 1,
  med: 2,
  medium: 2,
  mid: 2,
  high: 3,
  hi: 3,
  urgent: 3,
  important: 3,
};

function priorityOf(token: string): Priority {
  if (token.startsWith('p')) return (4 - Number(token[1])) as Priority;
  if (token.startsWith('!') && token.length > 1 && token[1] !== '!') return PRIORITY_WORDS[token.slice(1)] ?? 0;
  return token.length as Priority;
}

const weekdayAlternation = [...WEEKDAY_FULL, ...Object.keys(WEEKDAY_ABBR)]
  .sort((a, b) => b.length - a.length)
  .join('|');
const monthAlternation = Object.keys(MONTH_NAMES)
  .sort((a, b) => b.length - a.length)
  .join('|');

function weekdayIndex(word: string): number {
  const full = WEEKDAY_FULL.indexOf(word);
  return full >= 0 ? full : (WEEKDAY_ABBR[word] ?? -1);
}

function nextWeekday(today: DayKey, target: number, includeToday: boolean): DayKey {
  let delta = (target - weekdayOf(today) + 7) % 7;
  if (delta === 0 && !includeToday) delta = 7;
  return addDays(today, delta);
}

function resolveDayMonth(today: DayKey, day: number, month: number, year?: number): DayKey | null {
  if (month < 1 || month > 12 || day < 1) return null;
  const thisYear = Number(today.slice(0, 4));
  let y = year ?? thisYear;
  if (y < 100) y += 2000;
  if (y < 1970 || y > 2200) return null;
  const key = (yy: number) => `${yy}-${pad(month)}-${pad(day)}`;
  if (day > daysInMonth(`${y}-${pad(month)}`)) return null;
  let result = key(y);
  if (year === undefined && diffDays(today, result) < 0) {
    if (day > daysInMonth(`${y + 1}-${pad(month)}`)) return null;
    result = key(y + 1);
  }
  return result;
}

function to24(hour: number, minute: number, meridiem: string | undefined): TimeKey | null {
  let h = hour;
  if (minute < 0 || minute > 59) return null;
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    const pm = meridiem.startsWith('p');
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
  } else if (h > 23) {
    return null;
  }
  return `${pad(h)}:${pad(minute)}`;
}

type Step = { re: RegExp; apply: (m: RegExpExecArray) => boolean };

function run(input: string, steps: Step[]): string {
  let rest = input;
  for (const step of steps) {
    const m = step.re.exec(rest);
    if (m && step.apply(m)) {
      rest = `${rest.slice(0, m.index)}${m[1] ?? ''} ${rest.slice(m.index + m[0].length)}`;
      break;
    }
  }
  return rest;
}

type State = {
  dueDate: DayKey | null;
  dueTime: TimeKey | null;
  priority: Priority;
  tag: string | null;
  repeat: Repeat;
};

export function parseTask(input: string, options: ParseOptions): ParsedTask {
  const { today, now, ignore } = options;
  const weekStart = options.weekStart ?? 1;
  const s: State = { dueDate: null, dueTime: null, priority: 0, tag: null, repeat: 'none' };
  const allow = (kind: ChipKind) => !ignore?.has(kind);
  let rest = ` ${input} `;

  if (allow('priority')) {
    rest = run(rest, [
      {
        re: new RegExp(`${START}(!(?:${Object.keys(PRIORITY_WORDS).join('|')})|!{1,3}|p[1-3])${END}`, 'i'),
        apply: (m) => {
          s.priority = priorityOf(m[2].toLowerCase());
          return s.priority > 0;
        },
      },
    ]);
  }

  if (allow('tag')) {
    rest = run(rest, [
      {
        re: new RegExp(`${START}#([A-Za-z0-9_\\-\\u00C0-\\uFFFF]{1,32})${END}`),
        apply: (m) => {
          s.tag = m[2].toLowerCase();
          return true;
        },
      },
    ]);
  }

  const setRepeat = (value: Repeat) => () => {
    s.repeat = value;
    return true;
  };

  if (allow('repeat')) {
    rest = run(rest, [
      {
        re: new RegExp(`${START}every\\s+(${weekdayAlternation})${END}`, 'i'),
        apply: (m) => {
          s.repeat = 'weekly';
          if (allow('date')) s.dueDate = nextWeekday(today, weekdayIndex(m[2].toLowerCase()), true);
          return true;
        },
      },
      { re: new RegExp(`${START}(every\\s*day|daily)${END}`, 'i'), apply: setRepeat('daily') },
      {
        re: new RegExp(`${START}(every\\s+weekday|weekdays|on\\s+weekdays)${END}`, 'i'),
        apply: setRepeat('weekdays'),
      },
      { re: new RegExp(`${START}(every\\s+week|weekly)${END}`, 'i'), apply: setRepeat('weekly') },
      { re: new RegExp(`${START}(every\\s+month|monthly)${END}`, 'i'), apply: setRepeat('monthly') },
      {
        re: new RegExp(`${START}(every\\s+year|yearly|annually)${END}`, 'i'),
        apply: setRepeat('yearly'),
      },
    ]);
  }

  const PREFIX = '(?:(?:on|by|due|this)\\s+)?';
  const DAYPART = '(?:\\s+(morning|afternoon|evening|night))?';
  const setDate = (date: DayKey | null, part?: string) => {
    if (!date) return false;
    s.dueDate = date;
    if (part && s.dueTime === null && allow('time')) s.dueTime = PART_OF_DAY[part.toLowerCase()] ?? null;
    return true;
  };

  if (allow('date') && s.dueDate === null) {
    rest = run(rest, [
      {
        re: new RegExp(`${START}${PREFIX}(day after tomorrow)${DAYPART}${END}`, 'i'),
        apply: (m) => setDate(addDays(today, 2), m[3]),
      },
      {
        re: new RegExp(`${START}${PREFIX}(today|tod)${DAYPART}${END}`, 'i'),
        apply: (m) => setDate(today, m[3]),
      },
      {
        re: new RegExp(`${START}(tonight)${END}`, 'i'),
        apply: () => setDate(today, 'tonight'),
      },
      {
        re: new RegExp(`${START}${PREFIX}(tomorrow|tmrw|tmr|tomo)${DAYPART}${END}`, 'i'),
        apply: (m) => setDate(addDays(today, 1), m[3]),
      },
      {
        re: new RegExp(`${START}(?:(?:on|by|due)\\s+)?next\\s+week${END}`, 'i'),
        apply: () => setDate(addDays(startOfWeek(today, weekStart), 7)),
      },
      {
        re: new RegExp(`${START}(?:(?:on|by|due)\\s+)?next\\s+month${END}`, 'i'),
        apply: () => setDate(`${addMonths(today, 1).slice(0, 7)}-01`),
      },
      {
        re: new RegExp(`${START}(?:(?:on|by|this)\\s+)?(?:the\\s+)?weekend${END}`, 'i'),
        apply: () => setDate(nextWeekday(today, 6, true)),
      },
      {
        re: new RegExp(
          `${START}in\\s+(\\d{1,3}|an?|one|two|three|four|five|six|seven|eight|nine|ten)\\s+(days?|weeks?|months?)${END}`,
          'i',
        ),
        apply: (m) => {
          const n = WORD_NUMBERS[m[2].toLowerCase()] ?? Number(m[2]);
          const unit = m[3].toLowerCase();
          if (!Number.isFinite(n) || n < 1) return false;
          if (unit.startsWith('day')) return setDate(addDays(today, n));
          if (unit.startsWith('week')) return setDate(addDays(today, n * 7));
          return setDate(addMonths(today, n));
        },
      },
      {
        re: new RegExp(
          `${START}(?:(?:on|by|due)\\s+)?(next|this)\\s+(${weekdayAlternation})${DAYPART}${END}`,
          'i',
        ),
        apply: (m) => {
          const idx = weekdayIndex(m[3].toLowerCase());
          if (idx < 0) return false;
          // "this friday" is the coming one; "next friday" is the Friday of next week.
          const day =
            m[2].toLowerCase() === 'next'
              ? addDays(startOfWeek(today, weekStart), 7 + ((idx - weekStart + 7) % 7))
              : nextWeekday(today, idx, true);
          return setDate(day, m[4]);
        },
      },
      {
        re: new RegExp(`${START}(?:on|by|due)\\s+(${weekdayAlternation})${DAYPART}${END}`, 'i'),
        apply: (m) => {
          const idx = weekdayIndex(m[2].toLowerCase());
          if (idx < 0) return false;
          return setDate(nextWeekday(today, idx, true), m[3]);
        },
      },
      {
        re: new RegExp(`${START}(${WEEKDAY_FULL.join('|')})${DAYPART}${END}`, 'i'),
        apply: (m) => setDate(nextWeekday(today, WEEKDAY_FULL.indexOf(m[2].toLowerCase()), true), m[3]),
      },
      {
        re: new RegExp(
          `${START}${PREFIX}(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthAlternation})(?:\\s+(\\d{4}))?${END}`,
          'i',
        ),
        apply: (m) =>
          setDate(
            resolveDayMonth(today, Number(m[2]), MONTH_NAMES[m[3].toLowerCase()], m[4] ? Number(m[4]) : undefined),
          ),
      },
      {
        re: new RegExp(
          `${START}${PREFIX}(${monthAlternation})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?${END}`,
          'i',
        ),
        apply: (m) =>
          setDate(
            resolveDayMonth(today, Number(m[3]), MONTH_NAMES[m[2].toLowerCase()], m[4] ? Number(m[4]) : undefined),
          ),
      },
      {
        re: new RegExp(`${START}${PREFIX}(\\d{1,2})/(\\d{1,2})(?:/(\\d{2}|\\d{4}))?${END}`),
        apply: (m) =>
          setDate(resolveDayMonth(today, Number(m[2]), Number(m[3]), m[4] ? Number(m[4]) : undefined)),
      },
    ]);
  }

  const setTime = (time: TimeKey | null) => {
    if (!time) return false;
    s.dueTime = time;
    return true;
  };

  if (allow('time') && s.dueTime === null) {
    rest = run(rest, [
      {
        re: new RegExp(
          `${START}(?:at\\s+|@\\s?)?(\\d{1,2})(?::|\\.)?(\\d{2})?\\s?(am|pm|a\\.m\\.|p\\.m\\.)${END}`,
          'i',
        ),
        apply: (m) => setTime(to24(Number(m[2]), m[3] ? Number(m[3]) : 0, m[4].toLowerCase())),
      },
      {
        re: new RegExp(`${START}(?:at\\s+|@\\s?)?([01]?\\d|2[0-3]):([0-5]\\d)${END}`, 'i'),
        apply: (m) => setTime(to24(Number(m[2]), Number(m[3]), undefined)),
      },
      {
        re: new RegExp(`${START}(?:at|@)\\s?(\\d{1,2})${END}`, 'i'),
        apply: (m) => {
          const h = Number(m[2]);
          if (h > 23) return false;
          return setTime(`${pad(h >= 1 && h <= 6 ? h + 12 : h)}:00`);
        },
      },
      { re: new RegExp(`${START}(?:at\\s+)?(noon|midday)${END}`, 'i'), apply: () => setTime('12:00') },
      { re: new RegExp(`${START}(?:at\\s+)?(midnight)${END}`, 'i'), apply: () => setTime('23:59') },
      {
        re: new RegExp(`${START}(?:by\\s+)?(eod|end of day)${END}`, 'i'),
        apply: () => setTime('17:00'),
      },
      {
        re: new RegExp(`${START}(?:this|in the)\\s+(morning|afternoon|evening|night)${END}`, 'i'),
        apply: (m) => setTime(PART_OF_DAY[m[2].toLowerCase()] ?? null),
      },
    ]);
  }

  if (s.dueTime !== null && s.dueDate === null) {
    s.dueDate = s.dueTime > now ? today : addDays(today, 1);
  }
  if (s.repeat !== 'none' && s.dueDate === null) s.dueDate = today;
  if (s.repeat === 'weekdays' && s.dueDate !== null) {
    const day = weekdayOf(s.dueDate);
    if (day === 0) s.dueDate = addDays(s.dueDate, 1);
    if (day === 6) s.dueDate = addDays(s.dueDate, 2);
  }

  const title = rest
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;!?]+)(?=\s|$)/g, '$1')
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')
    .trim();

  const chips: ParsedTask['chips'] = [];
  if (s.dueDate) chips.push({ kind: 'date', label: formatDay(s.dueDate, today) });
  if (s.dueTime) chips.push({ kind: 'time', label: formatTime(s.dueTime) });
  if (s.repeat !== 'none') chips.push({ kind: 'repeat', label: REPEAT_LABEL[s.repeat] });
  if (s.priority > 0) chips.push({ kind: 'priority', label: PRIORITY_LABEL[s.priority as 1 | 2 | 3] });
  if (s.tag) chips.push({ kind: 'tag', label: `#${s.tag}` });

  return { title, ...s, chips };
}

export const repeatLabel = (repeat: Repeat): string => (repeat === 'none' ? 'Never' : REPEAT_LABEL[repeat]);
export const priorityLabel = (priority: Priority): string =>
  priority === 0 ? 'None' : PRIORITY_LABEL[priority];
