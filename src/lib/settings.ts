import { LIMITS } from './limits';
import { isCurrency } from './money';
import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  currency: 'INR',
  theme: 'system',
  budget: 0,
  upi: '',
  weekStart: 1,
  haptics: true,
  remindByDefault: false,
  lock: false,
  lockGrace: 0,
  privacy: true,
  onboarded: false,
};

export const LOCK_GRACE_OPTIONS = [0, 60, 300] as const;

const bool = (v: unknown) => typeof v === 'boolean';

export const SETTING_CHECKS: { [K in keyof Settings]: (v: unknown) => boolean } = {
  name: (v) => typeof v === 'string' && v.length <= LIMITS.name,
  currency: isCurrency,
  theme: (v) => v === 'system' || v === 'light' || v === 'dark',
  budget: (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= LIMITS.amount,
  upi: (v) => typeof v === 'string' && v.length <= LIMITS.upi,
  weekStart: (v) => v === 0 || v === 1,
  haptics: bool,
  remindByDefault: bool,
  lock: bool,
  lockGrace: (v) => (LOCK_GRACE_OPTIONS as readonly unknown[]).includes(v),
  privacy: bool,
  onboarded: bool,
};

/** Keeps only known keys with valid values. */
export function cleanSettings(patch: Partial<Record<keyof Settings, unknown>>): Partial<Settings> {
  const out: Partial<Record<keyof Settings, unknown>> = {};
  for (const key of Object.keys(SETTING_CHECKS) as (keyof Settings)[]) {
    if (Object.prototype.hasOwnProperty.call(patch, key) && SETTING_CHECKS[key](patch[key])) out[key] = patch[key];
  }
  return out as Partial<Settings>;
}

export function readSettings(stored: ReadonlyMap<string, unknown>, base: Settings): Settings {
  const raw: Partial<Record<keyof Settings, unknown>> = {};
  for (const key of Object.keys(SETTING_CHECKS) as (keyof Settings)[]) {
    if (stored.has(key)) raw[key] = stored.get(key);
  }
  return { ...base, ...cleanSettings(raw) };
}
