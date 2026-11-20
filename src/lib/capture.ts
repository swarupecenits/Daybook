import { guessCategory } from './categories';
import { addDays } from './dates';
import { amountFrom, detectIntent, parseAmountOnly, parseExpenseIntent, parseLooseMoney, type Intent } from './intent';
import { LIMITS } from './limits';
import { parseTask, type ChipKind, type ParsedTask } from './parse-task';
import { lastMethod } from './spending';
import { extractTags, parseLine } from './text';
import type { CategoryId, DayKey, EntryKind, Expense, PayMethod, Person, TimeKey } from './types';

const key = (name: string) => name.replace(/\s+/g, ' ').trim().toLocaleLowerCase();

export type FriendMatch = {
  person: Person | null;
  name: string;
  note: string;
  /** Friends who share the typed first name, when it's unclear which one is meant. */
  choices: Person[];
};

/**
 * Who a typed name means. Full names win, borrowing up to two words from the note so that
 * "500 rahul sharma dinner" finds Rahul Sharma; then a first name only one friend has.
 * Archived friends answer to their first name only when nobody in view does.
 */
export function matchFriend(people: readonly Person[], name: string, note = ''): FriendMatch {
  const none: FriendMatch = { person: null, name, note, choices: [] };
  const first = key(name);
  if (!first) return none;
  const live = people.filter((p) => p.deletedAt === null);
  const words = note.split(/\s+/).filter(Boolean);
  for (let extra = Math.min(2, words.length); extra >= 0; extra--) {
    const wanted = key([name, ...words.slice(0, extra)].join(' '));
    const person = live.find((p) => key(p.name) === wanted);
    if (person) {
      const rest = words.slice(extra).join(' ').replace(/^(?:for|as)\s+/i, '');
      return { person, name: person.name, note: extra ? rest : note, choices: [] };
    }
  }
  if (first.includes(' ')) return none;
  const named = live.filter((p) => key(p.name).split(' ')[0] === first);
  const active = named.filter((p) => !p.archived);
  const pool = active.length ? active : named;
  if (pool.length === 1) return { person: pool[0], name: pool[0].name, note, choices: [] };
  if (pool.length > 1) return { ...none, choices: pool };
  return none;
}

const DAY_WORDS = String.raw`(today|yesterday|yday|day before yesterday)`;
const LEAD_DAY = new RegExp(String.raw`^(?:on\s+)?${DAY_WORDS}(?:[\s,:-]+|$)`, 'i');
const TAIL_DAY = new RegExp(String.raw`[\s,]+(?:on\s+)?${DAY_WORDS}[.!]?$`, 'i');

/**
 * A day named at either end of the words, counted back from today: "lunch 250 yesterday",
 * "yesterday: lent Asha 500". Money and expenses are recorded after the fact, so only the past.
 */
export function splitDayWord(text: string): { text: string; back: number | null } {
  const input = text.trim();
  const tail = TAIL_DAY.exec(input);
  const m = tail ?? LEAD_DAY.exec(input);
  if (!m) return { text: input, back: null };
  const word = m[1].toLowerCase();
  const back = word === 'today' ? 0 : word === 'day before yesterday' ? 2 : 1;
  return { text: (tail ? input.slice(0, m.index) : input.slice(m[0].length)).trim(), back };
}

const NUMBER = /(^|\s)(?:rs\.?\s?|inr\s?|₹\s?)?(\d[\d,]*(?:\.\d{1,2})?)\s?(k)?(?=\s|$)/gi;

/** The one amount somewhere in the words, and the words around it: "uber 180 to the airport". */
export function amountWithin(text: string): { amount: number; rest: string } | null {
  const found = [...text.matchAll(NUMBER)];
  if (found.length !== 1) return null;
  const m = found[0];
  const amount = amountFrom(m[2], m[3]);
  if (amount === null) return null;
  const rest = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim();
  return { amount, rest };
}

/**
 * Like {@link detectIntent}, plus the rules that need more context: a friend's name next to an
 * amount ("rahul 500") is money with that friend, a day word doesn't hide an expense
 * ("lunch 250 yesterday"), and a line too long for a task title is a note.
 */
export function captureIntent(text: string, people: readonly Person[]): Intent {
  const intent = detectIntent(text);
  if (intent !== 'task') return intent;
  if (text.trim().length > LIMITS.title) return 'note';
  const { text: bare, back } = splitDayWord(text);
  if (back !== null && bare) {
    const dated = detectIntent(bare);
    if (dated === 'money' || dated === 'expense') return dated;
  }
  const money = parseLooseMoney(bare);
  if (!money) return 'task';
  const match = matchFriend(people, money.name, money.note);
  return match.person || match.choices.length ? 'money' : 'task';
}

/** Quick-capture text as a note. A short, plain first line becomes the title when more follows. */
export function noteFromText(text: string): { title: string; body: string } {
  const clean = text.replace(/\r\n?/g, '\n').trim();
  const nl = clean.indexOf('\n');
  if (nl < 0) return { title: '', body: clean };
  const first = parseLine(clean.slice(0, nl).trim(), 0);
  const rest = clean.slice(nl + 1).replace(/^(?:[ \t]*\n)+/, '');
  const titled = (first.kind === 'text' || first.kind === 'heading') && first.text.length <= 80;
  return titled && rest.trim() ? { title: first.text.trim(), body: rest } : { title: '', body: clean };
}

export type CaptureContext = {
  today: DayKey;
  now: TimeKey;
  weekStart: 0 | 1;
  /** The day capture was opened for, such as one picked on Today's week strip. */
  day: DayKey | null;
  /** Task chips the user removed, so their words stay in the title. */
  ignore: ReadonlySet<ChipKind>;
  people: readonly Person[];
  expenses: readonly Expense[];
  /** The friend picked when a first name fits several. */
  pick: string | null;
};

export type TaskPlan = {
  intent: 'task';
  ready: boolean;
  task: ParsedTask;
  dueDate: DayKey | null;
  /** The due date came from the context rather than the words. */
  fallback: boolean;
};
export type NotePlan = { intent: 'note'; ready: boolean; title: string; body: string; tags: string[] };
export type LogPlan = { intent: 'log'; ready: boolean; text: string; day: DayKey };
export type ExpensePlan = {
  intent: 'expense';
  ready: boolean;
  amount: number | null;
  title: string;
  category: CategoryId;
  method: PayMethod;
  day: DayKey;
};
export type MoneyPlan = {
  intent: 'money';
  ready: boolean;
  amount: number | null;
  name: string;
  note: string;
  /** Which way the words say the money went; null when they don't. */
  kind: EntryKind | null;
  person: Person | null;
  choices: Person[];
  day: DayKey;
};
export type CapturePlan = TaskPlan | NotePlan | LogPlan | ExpensePlan | MoneyPlan;

const capitalize = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text);

/** What saving the capture would create, worked out from the text alone. */
export function planCapture(intent: Intent, text: string, ctx: CaptureContext): CapturePlan {
  // Money and logs record what already happened; tasks look ahead. Either way an
  // out-of-range day falls back to today.
  const past = ctx.day !== null && ctx.day < ctx.today ? ctx.day : ctx.today;
  const ahead = ctx.day === null ? null : ctx.day > ctx.today ? ctx.day : ctx.today;
  const line = text.replace(/\s+/g, ' ').trim();
  switch (intent) {
    case 'task': {
      const task = parseTask(text, { today: ctx.today, now: ctx.now, weekStart: ctx.weekStart, ignore: ctx.ignore });
      const dueDate = task.dueDate ?? (task.repeat !== 'none' ? ctx.today : ahead);
      return { intent, ready: task.title.length > 0, task, dueDate, fallback: task.dueDate === null && dueDate !== null };
    }
    case 'note': {
      const { title, body } = noteFromText(text);
      return {
        intent,
        ready: title.length > 0 || body.trim().length > 0,
        title: title.slice(0, LIMITS.title),
        body: body.slice(0, LIMITS.body),
        tags: extractTags(text),
      };
    }
    case 'log':
      return { intent, ready: line.length > 0, text: line.slice(0, LIMITS.log), day: past };
    case 'expense': {
      const { text: bare, back } = splitDayWord(line);
      const parsed = parseExpenseIntent(bare);
      let amount = parsed?.amount ?? parseAmountOnly(bare);
      // "spent 500" parses with a stand-in title; leave it blank so the category names it.
      let title = parsed && parsed.title !== 'Expense' ? parsed.title : '';
      if (amount === null) {
        const within = amountWithin(bare);
        amount = within?.amount ?? null;
        title = capitalize(within ? within.rest : bare);
      }
      return {
        intent,
        ready: amount !== null,
        amount,
        title: title.slice(0, LIMITS.title),
        category: guessCategory(title) ?? 'other',
        method: lastMethod(ctx.expenses),
        day: back === null ? past : addDays(ctx.today, -back),
      };
    }
    case 'money': {
      const { text: bare, back } = splitDayWord(line);
      const day = back === null ? past : addDays(ctx.today, -back);
      const parsed = parseLooseMoney(bare);
      if (!parsed) {
        const amount = parseAmountOnly(bare);
        return { intent, ready: false, amount, name: '', note: '', kind: null, person: null, choices: [], day };
      }
      const match = matchFriend(ctx.people, parsed.name, parsed.note);
      const person = match.person ?? match.choices.find((p) => p.id === ctx.pick) ?? null;
      return {
        intent,
        ready: match.choices.length === 0 || person !== null,
        amount: parsed.amount,
        name: person?.name ?? match.name,
        note: match.note,
        kind: parsed.kind,
        person,
        choices: match.choices,
        day,
      };
    }
  }
}