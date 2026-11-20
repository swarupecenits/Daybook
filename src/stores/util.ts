export function upsertIn<T extends { id: string }>(list: readonly T[], item: T): T[] {
  const index = list.findIndex((x) => x.id === item.id);
  if (index < 0) return [item, ...list];
  const next = list.slice();
  next[index] = item;
  return next;
}

export function upsertAll<T extends { id: string }>(list: readonly T[], items: readonly T[]): T[] {
  if (!items.length) return list.slice();
  const byId = new Map(items.map((i) => [i.id, i]));
  const next = list.map((x) => {
    const replacement = byId.get(x.id);
    if (replacement) byId.delete(x.id);
    return replacement ?? x;
  });
  return byId.size ? [...byId.values(), ...next] : next;
}

export function withoutIds<T extends { id: string }>(list: readonly T[], ids: Iterable<string>): T[] {
  const set = new Set(ids);
  return set.size ? list.filter((x) => !set.has(x.id)) : list.slice();
}

export function findById<T extends { id: string }>(list: readonly T[], id: string): T | undefined {
  return list.find((x) => x.id === id);
}

export const isLive = <T extends { deletedAt: number | null }>(x: T): boolean => x.deletedAt === null;
