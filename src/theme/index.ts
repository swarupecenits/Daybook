import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';
import { useColorScheme, type ViewStyle } from 'react-native';

import { palettes, type Palette, type Scheme } from './palette';
import { formatMoney, type MoneyFormat } from '@/lib/money';
import { useSettings } from '@/stores/settings';

export { palettes, PAPER_COLORS, type Palette, type PaperColor, type Scheme } from './palette';
export { fonts, radius, space, springs, typo, type TypeVariant } from './type';

export function useScheme(): Scheme {
  const pref = useSettings((s) => s.theme);
  const system = useColorScheme();
  if (pref === 'system') return system === 'dark' ? 'dark' : 'light';
  return pref;
}

export function useTheme(): Palette {
  return palettes[useScheme()];
}

export function navigationTheme(c: Palette): Theme {
  const base = c.scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: c.scheme === 'dark',
    colors: {
      ...base.colors,
      primary: c.accent,
      background: c.bg,
      card: c.bg,
      text: c.ink,
      border: c.line,
      notification: c.negative,
    },
  };
}

/** Soft paper shadows in light mode; dark mode leans on borders instead. */
export function elevation(c: Palette, level: 1 | 2 | 3): ViewStyle {
  if (c.scheme === 'dark') {
    return level === 1 ? {} : { boxShadow: `0px ${level * 6}px ${level * 14}px rgba(0,0,0,0.5)` };
  }
  const alpha = [0.06, 0.1, 0.16][level - 1];
  return { boxShadow: `0px ${level * 3}px ${level * 10}px rgba(91,74,46,${alpha})` };
}

export function useCurrency(): string {
  return useSettings((s) => s.currency);
}

/** Formatter bound to the user's currency. */
export function useMoney(): (minor: number, format?: MoneyFormat) => string {
  const currency = useCurrency();
  return (minor, format) => formatMoney(minor, currency, format);
}
