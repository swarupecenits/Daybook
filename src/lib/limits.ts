export const LIMITS = {
  title: 200,
  body: 100_000,
  log: 1_000,
  name: 60,
  phone: 20,
  upi: 80,
  note: 500,
  taskNotes: 5_000,
  tag: 32,
  subtasks: 50,
  /** ₹100 crore expressed in paise (10^11 minor units). */
  amount: 100_000_000_000,
  backupBytes: 25 * 1024 * 1024,
} as const;

export function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

export function clean(value: string, max: number): string {
  return clip(value.replace(/\u0000/g, '').trim(), max);
}
