import { Appearance, Platform } from 'react-native';
import { create } from 'zustand';

import { persist } from './persist';
import { saveSettingsRows } from '@/db/repos';
import { setHapticsEnabled } from '@/lib/haptics';
import { cleanSettings, DEFAULT_SETTINGS } from '@/lib/settings';
import type { Settings } from '@/lib/types';

type SettingsState = Settings & {
  /** Validates and saves a patch. Returns false when storage failed. */
  update(patch: Partial<Settings>): boolean;
};

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

export function settingsOf(state: Settings): Settings {
  const out = {} as Record<keyof Settings, unknown>;
  for (const key of KEYS) out[key] = state[key];
  return out as Settings;
}

/** Pushes settings that live outside React (haptics engine, native colour scheme). */
export function applySettings(s: Settings) {
  setHapticsEnabled(s.haptics);
  if (Platform.OS === 'web') return;
  try {
    Appearance.setColorScheme(s.theme === 'system' ? 'unspecified' : s.theme);
  } catch {
    // Older runtimes without an override API fall back to the system theme.
  }
}

export const useSettings = create<SettingsState>()((set, get) => ({
  ...DEFAULT_SETTINGS,
  update(patch) {
    const clean = cleanSettings(patch);
    const current = get();
    const delta: Partial<Settings> = {};
    for (const key of Object.keys(clean) as (keyof Settings)[]) {
      if (clean[key] !== current[key]) (delta as Record<string, unknown>)[key] = clean[key];
    }
    if (!Object.keys(delta).length) return true;
    if (!persist(() => saveSettingsRows(delta))) return false;
    set(delta);
    applySettings(settingsOf(get()));
    return true;
  },
}));
