import { create } from 'zustand';

type SessionState = {
  locked: boolean;
  /**
   * Set while the app hands off to the system (file picker, share sheet, payment app) so coming
   * back doesn't trigger the app lock.
   */
  away: boolean;
  /** App is in the background or app switcher with lock or privacy on; content should be hidden. */
  covered: boolean;
  lock(): void;
  unlock(): void;
};

export const useSession = create<SessionState>()((set) => ({
  locked: false,
  away: false,
  covered: false,
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false }),
}));

/** Runs a system hand-off without locking the app when the user returns. */
export async function whileAway<T>(task: () => Promise<T>): Promise<T> {
  useSession.setState({ away: true });
  try {
    return await task();
  } finally {
    // Let the AppState "active" event land before the guard drops.
    setTimeout(() => useSession.setState({ away: false }), 800);
  }
}
