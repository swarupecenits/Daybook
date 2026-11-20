import type { Entry, EntryKind, Expense, SplitPart } from './types';

/** Splits `total` minor units into `n` near-equal integer parts. The first parts absorb the remainder. */
export function splitEqually(total: number, n: number): number[] {
  if (!Number.isInteger(total) || total < 0 || !Number.isInteger(n) || n <= 0) return [];
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

export type SplitPlan = { share: number; split: SplitPart[] };

/** Equal split of a bill. When I'm included I take the first part, so I absorb any odd paise. */
export function planEqualSplit(total: number, friendIds: readonly string[], includeMe: boolean): SplitPlan {
  const unique = [...new Set(friendIds)];
  const n = unique.length + (includeMe ? 1 : 0);
  if (n === 0 || unique.length === 0) return { share: total, split: [] };
  const parts = splitEqually(total, n);
  const offset = includeMe ? 1 : 0;
  return {
    share: includeMe ? parts[0] : 0,
    split: unique.map((personId, i) => ({ personId, amount: parts[i + offset] })),
  };
}

export type SplitIssue = 'amount' | 'share' | 'sum' | 'payer' | 'duplicate';

export function checkSplit(e: Pick<Expense, 'amount' | 'share' | 'paidBy' | 'split'>): SplitIssue | null {
  if (!Number.isInteger(e.amount) || e.amount <= 0) return 'amount';
  if (!Number.isInteger(e.share) || e.share < 0 || e.share > e.amount) return 'share';
  const ids = new Set(e.split.map((p) => p.personId));
  if (ids.size !== e.split.length) return 'duplicate';
  if (e.split.some((p) => !Number.isInteger(p.amount) || p.amount < 0)) return 'sum';
  const sum = e.split.reduce((acc, p) => acc + p.amount, 0);
  if (e.split.length === 0 ? e.share !== e.amount : sum + e.share !== e.amount) return 'sum';
  if (e.paidBy !== 'me' && e.share === 0) return 'payer';
  return null;
}

export type LinkedEntry = Pick<Entry, 'personId' | 'kind' | 'amount' | 'note' | 'date' | 'expenseId'>;

/**
 * Ledger entries an expense implies.
 * I paid: every friend owes me their part (`gave`).
 * A friend paid: I owe that friend my part (`got`). Other friends settle with the payer, not with me.
 */
export function linkedEntries(
  e: Pick<Expense, 'id' | 'title' | 'share' | 'paidBy' | 'split' | 'date'>,
): LinkedEntry[] {
  const base = { note: e.title, date: e.date, expenseId: e.id };
  if (e.paidBy === 'me') {
    return e.split
      .filter((p) => p.amount > 0)
      .map((p) => ({ ...base, personId: p.personId, kind: 'gave' as EntryKind, amount: p.amount }));
  }
  return e.share > 0 ? [{ ...base, personId: e.paidBy, kind: 'got', amount: e.share }] : [];
}
