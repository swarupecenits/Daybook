import { getCalendars, getLocales } from 'expo-localization';

import { isCurrency } from './money';

export type DeviceDefaults = { currency: string; weekStart: 0 | 1; clock24: boolean };

export function deviceDefaults(): DeviceDefaults {
  const out: DeviceDefaults = { currency: 'INR', weekStart: 1, clock24: false };
  try {
    const code = getLocales()[0]?.currencyCode;
    if (code && isCurrency(code)) out.currency = code;
    const calendar = getCalendars()[0];
    // expo-localization numbers weekdays from 1 = Sunday.
    if (calendar?.firstWeekday === 1) out.weekStart = 0;
    out.clock24 = calendar?.uses24hourClock === true;
  } catch {
    // Fall back to defaults.
  }
  return out;
}
