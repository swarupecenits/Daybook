import { setDb } from '@/db/adapter';
import { migrate } from '@/db/schema';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { useLedger } from '@/stores/ledger';
import { useLogs } from '@/stores/logs';
import { useNotes } from '@/stores/notes';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { resetTaskRuntime, useTasks } from '@/stores/tasks';
import { useToast } from '@/stores/toast';
import { memoryDb } from '@/test/memory-db';

let previous: ReturnType<typeof memoryDb> | null = null;
let restoreClock: (() => void) | null = null;

/** Every `Date.now()` is one second after the last, so edit stamps never collide. */
function steppingClock(start: number) {
  restoreClock?.();
  let now = start;
  const spy = jest.spyOn(Date, 'now').mockImplementation(() => (now += 1_000));
  restoreClock = () => spy.mockRestore();
}

/** A blank device: empty in-memory database, empty stores and a deterministic clock. */
export async function freshDevice(start = new Date(2026, 2, 10, 9, 0).getTime()) {
  // Forget the old device first, so its in-flight reminders see a stale version and back off.
  resetTaskRuntime();
  useNotes.setState({ notes: [] });
  useTasks.setState({ tasks: [] });
  useLogs.setState({ logs: [] });
  useLedger.setState({ people: [], entries: [], expenses: [] });
  useSettings.setState({ ...DEFAULT_SETTINGS });
  useSession.setState({ locked: false, away: false });
  useToast.setState({ current: null });
  await previous?.close();
  steppingClock(start);
  const mem = memoryDb();
  previous = mem;
  setDb(mem);
  await migrate(mem);
  return mem;
}

/** Lets pending promise callbacks (scheduled reminders) run. */
export const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export const byId = <T extends { id: string }>(rows: readonly T[]) =>
  [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
