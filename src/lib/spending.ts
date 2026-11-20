import { daysInMonth, diffDays } from './dates';
import type { CategoryId, DayKey, Expense, PayMethod } from './types';

export function liveExpenses(expenses: readonly Expense[]): Expense[] {
  return expenses.filter((e) => e.deletedAt === null);
}

export function inMonth(expenses: readonly Expense[], month: string): Expense[] {
  return expenses
    .filter((e) => e.deletedAt === null && e.date.startsWith(month))
    .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
}

/** What I actually spent: my share of each bill. */
export function spent(expenses: readonly Expense[]): number {
  let total = 0;
  for (const e of expenses) total += e.share;
  return total;
}

export type CategoryTotal = { id: CategoryId; total: number; count: number };

export function byCategory(expenses: readonly Expense[]): CategoryTotal[] {
  const map = new Map<CategoryId, CategoryTotal>();
  for (const e of expenses) {
    if (e.share <= 0) continue;
    const row = map.get(e.category) ?? { id: e.category, total: 0, count: 0 };
    row.total += e.share;
    row.count += 1;
    map.set(e.category, row);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/** Spending per day of the month, index 0 = the 1st. */
export function dailyTotals(expenses: readonly Expense[], month: string): number[] {
  const days = new Array<number>(daysInMonth(month)).fill(0);
  for (const e of expenses) {
    if (!e.date.startsWith(month)) continue;
    const day = Number(e.date.slice(8, 10));
    if (day >= 1 && day <= days.length) days[day - 1] += e.share;
  }
  return days;
}

export type DayGroup = { day: DayKey; total: number; items: Expense[] };

export function groupByDay(expenses: readonly Expense[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const e of expenses) {
    const last = groups[groups.length - 1];
    if (last && last.day === e.date) {
      last.items.push(e);
      last.total += e.share;
    } else {
      groups.push({ day: e.date, total: e.share, items: [e] });
    }
  }
  return groups;
}

export type BudgetStatus = {
  ratio: number;
  remaining: number;
  /** Comfortable spend per remaining day, including today. 0 when over budget or month ended. */
  perDay: number;
  /** Straight-line projection for the whole month. */
  projected: number;
  daysLeft: number;
};

export function budgetStatus(spentSoFar: number, budget: number, month: string, today: DayKey): BudgetStatus {
  const total = daysInMonth(month);
  const first = `${month}-01`;
  const elapsed = Math.min(total, Math.max(0, diffDays(first, today) + 1));
  const daysLeft = today.startsWith(month) ? total - elapsed + 1 : elapsed === 0 ? total : 0;
  const remaining = budget - spentSoFar;
  return {
    ratio: budget > 0 ? spentSoFar / budget : 0,
    remaining,
    perDay: remaining > 0 && daysLeft > 0 ? Math.floor(remaining / daysLeft) : 0,
    projected: elapsed > 0 ? Math.round((spentSoFar / elapsed) * total) : 0,
    daysLeft,
  };
}

export function monthsWithData(expenses: readonly Expense[]): string[] {
  const set = new Set<string>();
  for (const e of expenses) if (e.deletedAt === null) set.add(e.date.slice(0, 7));
  return [...set].sort().reverse();
}

/** How the newest expense was paid, so the next one starts the same way. */
export function lastMethod(expenses: readonly Expense[]): PayMethod {
  let latest: Expense | undefined;
  for (const e of expenses) {
    if (e.deletedAt === null && (!latest || e.createdAt > latest.createdAt)) latest = e;
  }
  return latest?.method ?? 'upi';
}
