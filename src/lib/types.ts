import type { PaperColor } from '@/theme/palette';

export type { PaperColor };

/** Local calendar day, `YYYY-MM-DD`. */
export type DayKey = string;
/** Local wall-clock time, `HH:MM` (24h). */
export type TimeKey = string;

type Stamped = {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

export type Note = Stamped & {
  title: string;
  body: string;
  color: PaperColor;
  pinned: boolean;
  archived: boolean;
};

export type Priority = 0 | 1 | 2 | 3;
export type Repeat = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';
export type Subtask = { id: string; title: string; done: boolean };

export type Task = Stamped & {
  title: string;
  notes: string;
  dueDate: DayKey | null;
  dueTime: TimeKey | null;
  priority: Priority;
  tag: string | null;
  subtasks: Subtask[];
  repeat: Repeat;
  /** Day of month a monthly/yearly series is pinned to, so 31st doesn't drift to 28th after February. */
  anchorDay: number | null;
  remind: boolean;
  notifId: string | null;
  doneAt: number | null;
};

export type LogItem = Stamped & {
  day: DayKey;
  text: string;
};

export type Person = Stamped & {
  name: string;
  phone: string;
  upi: string;
  note: string;
  archived: boolean;
};

/** `gave`: I gave them money (they owe me more). `got`: I received money (they owe me less). */
export type EntryKind = 'gave' | 'got';

export type Entry = Stamped & {
  personId: string;
  kind: EntryKind;
  /** Minor units (paise / cents), always > 0. */
  amount: number;
  note: string;
  date: DayKey;
  expenseId: string | null;
};

export type CategoryId =
  | 'food'
  | 'groceries'
  | 'transport'
  | 'shopping'
  | 'bills'
  | 'rent'
  | 'health'
  | 'fun'
  | 'travel'
  | 'coffee'
  | 'education'
  | 'gifts'
  | 'recharge'
  | 'other';

export type PayMethod = 'upi' | 'cash' | 'card' | 'bank';

export type SplitPart = { personId: string; amount: number };

export type Expense = Stamped & {
  title: string;
  /** Full bill in minor units. */
  amount: number;
  /** My part of the bill in minor units (what I actually spent). */
  share: number;
  category: CategoryId;
  method: PayMethod;
  date: DayKey;
  note: string;
  /** `me` or the id of the friend who paid. */
  paidBy: string;
  split: SplitPart[];
};

export type ThemePref = 'system' | 'light' | 'dark';

export type Settings = {
  name: string;
  currency: string;
  theme: ThemePref;
  budget: number;
  upi: string;
  weekStart: 0 | 1;
  haptics: boolean;
  remindByDefault: boolean;
  lock: boolean;
  lockGrace: number;
  privacy: boolean;
  onboarded: boolean;
};
