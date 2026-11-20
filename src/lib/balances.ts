import type { Entry, Person } from './types';

/** + when they owe me, − when I owe them. */
export function signed(e: Pick<Entry, 'kind' | 'amount'>): number {
  return e.kind === 'gave' ? e.amount : -e.amount;
}

/** A balance in plain words: "Asha owes you ₹500", "You owe Asha ₹200", "You and Asha are square". */
export function standing(first: string, balance: number, format: (minor: number) => string, capital = true): string {
  const you = capital ? 'You' : 'you';
  if (balance > 0) return `${first} owes you ${format(balance)}`;
  if (balance < 0) return `${you} owe ${first} ${format(-balance)}`;
  return `${you} and ${first} are square`;
}

export function byChronology(a: Entry, b: Entry): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.createdAt - b.createdAt;
}

export function balances(entries: readonly Entry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (e.deletedAt !== null) continue;
    map.set(e.personId, (map.get(e.personId) ?? 0) + signed(e));
  }
  return map;
}

export type MoneyTotals = {
  /** Sum of positive balances. */
  owedToMe: number;
  /** Sum of negative balances, as a positive number. */
  iOwe: number;
  net: number;
  /** People with a non-zero balance. */
  open: number;
};

export function totals(balanceMap: ReadonlyMap<string, number>, people?: readonly Person[]): MoneyTotals {
  const active = people ? new Set(people.filter((p) => p.deletedAt === null).map((p) => p.id)) : null;
  let owedToMe = 0;
  let iOwe = 0;
  let open = 0;
  for (const [id, value] of balanceMap) {
    if (active && !active.has(id)) continue;
    if (value > 0) owedToMe += value;
    if (value < 0) iOwe -= value;
    if (value !== 0) open += 1;
  }
  return { owedToMe, iOwe, net: owedToMe - iOwe, open };
}

export type LedgerRow = { entry: Entry; balance: number };

/** One person's entries, newest first, each with the running balance after it. */
export function ledger(entries: readonly Entry[], personId: string): LedgerRow[] {
  const mine = entries.filter((e) => e.personId === personId && e.deletedAt === null).sort(byChronology);
  let running = 0;
  const rows = mine.map((entry) => {
    running += signed(entry);
    return { entry, balance: running };
  });
  return rows.reverse();
}

export function lastActivity(entries: readonly Entry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (e.deletedAt !== null) continue;
    const at = Math.max(e.updatedAt, e.createdAt);
    if (at > (map.get(e.personId) ?? 0)) map.set(e.personId, at);
  }
  return map;
}

export type FriendFilter = 'all' | 'owe-me' | 'i-owe' | 'settled';

export type FriendRow = { person: Person; balance: number; lastAt: number };

export function friendRows(
  people: readonly Person[],
  entries: readonly Entry[],
  filter: FriendFilter = 'all',
): FriendRow[] {
  const bal = balances(entries);
  const last = lastActivity(entries);
  return people
    .filter((p) => p.deletedAt === null && !p.archived)
    .map((person) => ({
      person,
      balance: bal.get(person.id) ?? 0,
      lastAt: last.get(person.id) ?? person.createdAt,
    }))
    .filter((row) =>
      filter === 'all'
        ? true
        : filter === 'owe-me'
          ? row.balance > 0
          : filter === 'i-owe'
            ? row.balance < 0
            : row.balance === 0,
    )
    .sort((a, b) => {
      const openA = a.balance !== 0 ? 1 : 0;
      const openB = b.balance !== 0 ? 1 : 0;
      if (openA !== openB) return openB - openA;
      return b.lastAt - a.lastAt;
    });
}

/** Amount and direction needed to bring a balance to zero. */
export function settlement(balance: number): { kind: Entry['kind']; amount: number } | null {
  if (balance === 0) return null;
  return balance > 0 ? { kind: 'got', amount: balance } : { kind: 'gave', amount: -balance };
}
