import { toast } from './toast';

/** Runs a write. If storage fails, the change is dropped so memory never drifts from disk. */
export function persist(write: () => void): boolean {
  try {
    write();
    return true;
  } catch (error) {
    reportWriteError(error);
    return false;
  }
}

export function reportWriteError(error: unknown) {
  if (__DEV__) console.warn('[daybook] could not save', error);
  toast({ message: "Couldn't save that change. Please try again.", tone: 'danger', icon: 'warning' });
}
