import { create } from 'zustand';

import { persist } from './persist';
import { findById, upsertIn, withoutIds } from './util';
import { logsTable } from '@/db/repos';
import { isDayKey, todayKey } from '@/lib/dates';
import { newId } from '@/lib/ids';
import { clean, LIMITS } from '@/lib/limits';
import type { DayKey, LogItem } from '@/lib/types';

type LogsState = {
  logs: LogItem[];
  add(text: string, day?: DayKey): LogItem | null;
  update(id: string, text: string): void;
  remove(id: string): void;
  restore(id: string): void;
  destroy(id: string): void;
};

export const useLogs = create<LogsState>()((set, get) => {
  const write = (next: LogItem): boolean => {
    if (!persist(() => logsTable.save(next))) return false;
    set({ logs: upsertIn(get().logs, next) });
    return true;
  };

  return {
    logs: [],

    add(text, day) {
      const body = clean(text, LIMITS.log);
      if (!body) return null;
      const now = Date.now();
      const log: LogItem = {
        id: newId(),
        day: day && isDayKey(day) ? day : todayKey(),
        text: body,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      return write(log) ? log : null;
    },

    update(id, text) {
      const prev = findById(get().logs, id);
      const body = clean(text, LIMITS.log);
      if (!prev || !body || body === prev.text) return;
      write({ ...prev, text: body, updatedAt: Date.now() });
    },

    remove(id) {
      const prev = findById(get().logs, id);
      if (!prev || prev.deletedAt !== null) return;
      const now = Date.now();
      write({ ...prev, deletedAt: now, updatedAt: now });
    },

    restore(id) {
      const prev = findById(get().logs, id);
      if (!prev || prev.deletedAt === null) return;
      write({ ...prev, deletedAt: null, updatedAt: Date.now() });
    },

    destroy(id) {
      if (!persist(() => logsTable.destroy([id]))) return;
      set({ logs: withoutIds(get().logs, [id]) });
    },
  };
});
