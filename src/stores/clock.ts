import { AppState } from 'react-native';
import { create } from 'zustand';

import { timeOf, todayKey } from '@/lib/dates';
import type { DayKey, TimeKey } from '@/lib/types';

type Clock = {
  today: DayKey;
  /** Current minute, `HH:MM`. */
  now: TimeKey;
  /** Epoch ms of the last minute change, for relative labels. */
  at: number;
};

function read(): Clock {
  const d = new Date();
  return { today: todayKey(d), now: timeOf(d), at: d.getTime() };
}

/** One shared minute clock, so screens don't each run timers or call Date during render. */
export const useClock = create<Clock>()(() => read());

let timer: ReturnType<typeof setTimeout> | null = null;

function tick() {
  const next = read();
  const prev = useClock.getState();
  if (next.today !== prev.today || next.now !== prev.now) useClock.setState(next);
  if (timer) clearTimeout(timer);
  timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 25);
}

export function startClock(): () => void {
  tick();
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') tick();
  });
  return () => {
    if (timer) clearTimeout(timer);
    timer = null;
    sub.remove();
  };
}
