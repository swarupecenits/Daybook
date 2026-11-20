import { create } from 'zustand';

import type { DayKey } from '@/lib/types';

export type MoneyView = 'friends' | 'spending';

const MAX_RECENT = 6;

type UiState = {
  /** Which half of the Money tab is showing, so the + button adds the right thing. */
  moneyView: MoneyView;
  /** A request for Today to show a particular day; `at` makes repeated requests distinct. */
  jump: { day: DayKey; at: number } | null;
  /** This session's searches, newest first. Never written to disk. */
  recentSearches: string[];
};

export const useUi = create<UiState>()(() => ({ moneyView: 'friends', jump: null, recentSearches: [] }));

export function rememberSearch(query: string) {
  const q = query.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (q.length < 2) return;
  const key = q.toLocaleLowerCase();
  const rest = useUi.getState().recentSearches.filter((r) => r.toLocaleLowerCase() !== key);
  useUi.setState({ recentSearches: [q, ...rest].slice(0, MAX_RECENT) });
}

export function forgetSearches() {
  useUi.setState({ recentSearches: [] });
}

export function jumpToDay(day: DayKey) {
  useUi.setState({ jump: { day, at: Date.now() } });
}
