import { guessCategory } from './categories';
import { LIMITS } from './limits';
import type { CategoryId, EntryKind } from './types';

export type Intent = 'task' | 'note' | 'log' | 'expense' | 'money';

export const INTENTS: readonly Intent[] = ['task', 'note', 'log', 'expense', 'money'];

const AMOUNT = String.raw`(?:rs\.?|inr|₹)?\s?(\d[\d,]*(?:\.\d{1,2})?)\s?(k)?(?:\s?(?:rs|rupees|bucks))?`;
const NAME = String.raw`([a-z\u00C0-\uFFFF][a-z\u00C0-\uFFFF.'-]*(?:\s+[a-z\u00C0-\uFFFF][a-z\u00C0-\uFFFF.'-]*){0,2}?)`;
const NOTE = String.raw`(?:\s+(?:for|as)\s+(.+))?`;

export function amountFrom(raw: string, thousands?: string): number | null {
  const value = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  const minor = Math.round(value * (thousands ? 1000 : 1) * 100);
  return minor > 0 && minor <= LIMITS.amount ? minor : null;
}

export type MoneyIntent = { name: string; amount: number; kind: EntryKind; note: string };

type MoneyRule = { re: RegExp; kind: EntryKind; name: number; amount: number; note?: number };

const r = (source: string) => new RegExp(`^\\s*${source}\\s*$`, 'i');

const MONEY_RULES: MoneyRule[] = [
  { re: r(`${NAME}\\s+owes\\s+me\\s+${AMOUNT}${NOTE}`), kind: 'gave', name: 1, amount: 2, note: 4 },
  { re: r(`i\\s+owe\\s+${NAME}\\s+${AMOUNT}${NOTE}`), kind: 'got', name: 1, amount: 2, note: 4 },
  { re: r(`(?:lent|gave|paid|sent)\\s+${AMOUNT}\\s+to\\s+${NAME}${NOTE}`), kind: 'gave', amount: 1, name: 3, note: 4 },
  { re: r(`(?:lent|gave|paid|sent)\\s+${NAME}\\s+${AMOUNT}${NOTE}`), kind: 'gave', name: 1, amount: 2, note: 4 },
  { re: r(`(?:got|received|borrowed|took)\\s+${AMOUNT}\\s+from\\s+${NAME}${NOTE}`), kind: 'got', amount: 1, name: 3, note: 4 },
  { re: r(`${NAME}\\s+(?:paid|gave|sent|returned)\\s+me\\s+${AMOUNT}${NOTE}`), kind: 'got', name: 1, amount: 2, note: 4 },
  { re: r(`${NAME}\\s+returned\\s+${AMOUNT}${NOTE}`), kind: 'got', name: 1, amount: 2, note: 4 },
];

const NOT_NAMES = new Set(['i', 'me', 'you', 'we', 'he', 'she', 'they', 'it', 'spent', 'bill', 'the']);
/** Words that start a phrase rather than a name, e.g. "500 for dinner". */
const NOT_FIRST_NAMES = new Set([
  ...NOT_NAMES,
  'a',
  'an',
  'and',
  'at',
  'for',
  'from',
  'got',
  'gave',
  'lent',
  'my',
  'on',
  'paid',
  'sent',
  'to',
  'with',
]);

function titleCase(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function parseMoneyIntent(text: string): MoneyIntent | null {
  const input = text.trim();
  if (!input || input.length > 200) return null;
  for (const rule of MONEY_RULES) {
    const m = rule.re.exec(input);
    if (!m) continue;
    const name = m[rule.name]?.trim();
    const amount = amountFrom(m[rule.amount], m[rule.amount + 1]);
    if (!name || !amount || NOT_NAMES.has(name.toLowerCase())) continue;
    const note = rule.note ? (m[rule.note] ?? '').trim() : '';
    return { name: titleCase(name).slice(0, LIMITS.name), amount, kind: rule.kind, note: note.slice(0, LIMITS.note) };
  }
  return null;
}

export type LooseMoney = { name: string; amount: number; kind: EntryKind | null; note: string };

const LOOSE_NOTE = String.raw`(?:\s+(?:for\s+|as\s+)?(.+))?`;

const LOOSE_RULES: { re: RegExp; name: number; amount: number; note: number; dir?: number }[] = [
  { re: r(`${NAME}\\s+${AMOUNT}${LOOSE_NOTE}`), name: 1, amount: 2, note: 4 },
  { re: r(`${AMOUNT}\\s+(to|from)\\s+${NAME}${LOOSE_NOTE}`), amount: 1, dir: 3, name: 4, note: 5 },
  { re: r(`${AMOUNT}\\s+${NAME}${LOOSE_NOTE}`), amount: 1, name: 3, note: 4 },
];

/**
 * Money with a friend, phrased loosely: "Rahul 500 dinner", "500 to Rahul", "1.2k from Asha".
 * Falls back from the full sentences of {@link parseMoneyIntent}; `kind` is null when the words
 * don't say which way the money went.
 */
export function parseLooseMoney(text: string): LooseMoney | null {
  const strict = parseMoneyIntent(text);
  if (strict) return strict;
  const input = text.trim();
  if (!input || input.length > 200) return null;
  for (const rule of LOOSE_RULES) {
    const m = rule.re.exec(input);
    if (!m) continue;
    const name = m[rule.name]?.trim();
    const amount = amountFrom(m[rule.amount], m[rule.amount + 1]);
    if (!name || !amount || NOT_FIRST_NAMES.has(name.split(/\s+/)[0].toLowerCase())) continue;
    const dir = rule.dir ? m[rule.dir].toLowerCase() : null;
    const kind: EntryKind | null = dir === 'to' ? 'gave' : dir === 'from' ? 'got' : null;
    const note = (m[rule.note] ?? '').trim();
    return { name: titleCase(name).slice(0, LIMITS.name), amount, kind, note: note.slice(0, LIMITS.note) };
  }
  return null;
}

const BARE_AMOUNT = r(AMOUNT);

/** Just an amount: "500", "₹1,200", "1.5k". */
export function parseAmountOnly(text: string): number | null {
  const m = BARE_AMOUNT.exec(text);
  return m ? amountFrom(m[1], m[2]) : null;
}

export type ExpenseIntent = { amount: number; title: string; category: CategoryId };

const EXPENSE_RULES: { re: RegExp; amount: number; title: number }[] = [
  { re: r(`spent\\s+${AMOUNT}\\s+(?:on|for|at)\\s+(.+)`), amount: 1, title: 3 },
  { re: r(`spent\\s+${AMOUNT}\\s*(.*)`), amount: 1, title: 3 },
  { re: r(`paid\\s+${AMOUNT}\\s+(?:for|on|at)\\s+(.+)`), amount: 1, title: 3 },
  { re: r(`(?:rs\\.?|inr|₹)\\s?(\\d[\\d,]*(?:\\.\\d{1,2})?)\\s?(k)?\\s+(?:on|for|at)?\\s*(.+)`), amount: 1, title: 3 },
  { re: r(`(.+?)\\s+(?:rs\\.?|inr|₹)?\\s?(\\d[\\d,]*(?:\\.\\d{1,2})?)\\s?(k)?`), amount: 2, title: 1 },
  { re: r(`(\\d[\\d,]*(?:\\.\\d{1,2})?)\\s?(k)?\\s+(?:on|for|at)?\\s*(.+)`), amount: 1, title: 3 },
];

export function parseExpenseIntent(text: string): ExpenseIntent | null {
  const input = text.trim();
  if (!input || input.length > 200) return null;
  for (const rule of EXPENSE_RULES) {
    const m = rule.re.exec(input);
    if (!m) continue;
    const amount = amountFrom(m[rule.amount], m[rule.amount + 1]);
    if (!amount) continue;
    const rawTitle = (m[rule.title] ?? '').trim().replace(/^(on|for|at)\s+/i, '');
    const title = rawTitle ? rawTitle[0].toUpperCase() + rawTitle.slice(1) : 'Expense';
    return { amount, title: title.slice(0, LIMITS.title), category: guessCategory(title) ?? 'other' };
  }
  return null;
}

const PREFIX = /^\s*(note|n|log|did|done|task|t|spent|paid)\s*:\s*/i;

/** A leading command such as "note:", "log:", "t:" or "spent:", and the text after it. */
export function splitPrefix(text: string): { intent: Intent; key: string; rest: string } | null {
  const m = PREFIX.exec(text);
  if (!m) return null;
  const key = m[1].toLowerCase();
  const intent: Intent =
    key === 'note' || key === 'n'
      ? 'note'
      : key === 'log' || key === 'did' || key === 'done'
        ? 'log'
        : key === 'spent' || key === 'paid'
          ? 'expense'
          : 'task';
  return { intent, key, rest: text.slice(m[0].length) };
}

export function stripIntentPrefix(text: string): { intent: Intent | null; text: string } {
  const prefix = splitPrefix(text);
  if (!prefix) return { intent: null, text };
  return { intent: prefix.intent, text: prefix.intent === 'expense' ? `${prefix.key} ${prefix.rest}` : prefix.rest };
}

/** "spent 2h on the review", "spent an hour with design": time, not money. */
const TIME_SPENT =
  /^\s*spent\s+(?:\d+(?:\.\d+)?|an?|half\s+an?|the\s+whole|all)\s*(?:h|hrs?|hours?|m|mins?|minutes?|days?|weeks?|morning|afternoon|evening|day)\b/i;

export function detectIntent(text: string): Intent {
  const { intent, text: rest } = stripIntentPrefix(text);
  if (intent) return intent;
  if (!rest.trim()) return 'task';
  if (/\n/.test(rest.trim())) return 'note';
  if (parseMoneyIntent(rest)) return 'money';
  if (TIME_SPENT.test(rest)) return 'log';
  if (/^\s*(rs\.?|inr|₹)\s?\d/i.test(rest) || parseAmountOnly(rest) !== null) return 'expense';
  const expense = parseExpenseIntent(rest);
  // "spent"/"paid" name an expense outright, but only once there's an amount to go with it.
  if (expense && (/^\s*(spent|paid)\b/i.test(rest) || expense.category !== 'other')) return 'expense';
  return 'task';
}
