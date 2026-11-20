import { LIMITS } from './limits';

export type CurrencyInfo = {
  code: string;
  symbol: string;
  name: string;
  /** Digits shown after the decimal point. Storage is always 1/100 of the unit. */
  decimals: 0 | 2;
  /** Lakh/crore digit grouping (1,23,45,678). */
  indian: boolean;
};

export const CURRENCIES: readonly CurrencyInfo[] = [
  { code: 'INR', symbol: '₹', name: 'Indian rupee', decimals: 2, indian: true },
  { code: 'USD', symbol: '$', name: 'US dollar', decimals: 2, indian: false },
  { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2, indian: false },
  { code: 'GBP', symbol: '£', name: 'British pound', decimals: 2, indian: false },
  { code: 'AED', symbol: 'AED ', name: 'UAE dirham', decimals: 2, indian: false },
  { code: 'SGD', symbol: 'S$', name: 'Singapore dollar', decimals: 2, indian: false },
  { code: 'AUD', symbol: 'A$', name: 'Australian dollar', decimals: 2, indian: false },
  { code: 'CAD', symbol: 'C$', name: 'Canadian dollar', decimals: 2, indian: false },
  { code: 'JPY', symbol: '¥', name: 'Japanese yen', decimals: 0, indian: false },
];

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function currencyInfo(code: string): CurrencyInfo {
  return BY_CODE.get(code) ?? CURRENCIES[0];
}

export function isCurrency(code: unknown): code is string {
  return typeof code === 'string' && BY_CODE.has(code);
}

function group(digits: string, indian: boolean): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const size = indian ? 2 : 3;
  const chunks: string[] = [];
  for (let end = rest.length; end > 0; end -= size) {
    chunks.unshift(rest.slice(Math.max(0, end - size), end));
  }
  return `${chunks.join(',')},${last3}`;
}

export type MoneyFormat = {
  /** `always` prefixes + for positive values. */
  sign?: 'auto' | 'always' | 'never';
  /** Short form for charts: ₹1.2L, $3.4K. */
  compact?: boolean;
  /** Show .00 even for whole amounts. */
  fixed?: boolean;
};

const MINUS = '\u2212';

function compactParts(units: number, indian: boolean): string | null {
  const steps: [number, string][] = indian
    ? [
        [10_000_000, 'Cr'],
        [100_000, 'L'],
        [1_000, 'K'],
      ]
    : [
        [1_000_000_000, 'B'],
        [1_000_000, 'M'],
        [1_000, 'K'],
      ];
  for (const [size, suffix] of steps) {
    if (units >= size) {
      const value = units / size;
      const text = value >= 100 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, '');
      return `${text}${suffix}`;
    }
  }
  return null;
}

export function formatMoney(minor: number, code: string, format: MoneyFormat = {}): string {
  const info = currencyInfo(code);
  const safe = Number.isFinite(minor) ? Math.round(minor) : 0;
  const abs = Math.abs(safe);
  let body: string;
  const compact = format.compact ? compactParts(abs / 100, info.indian) : null;
  if (compact) {
    body = compact;
  } else if (info.decimals === 0) {
    body = group(String(Math.round(abs / 100)), info.indian);
  } else {
    const units = Math.floor(abs / 100);
    const cents = abs % 100;
    const whole = group(String(units), info.indian);
    body = cents === 0 && !format.fixed ? whole : `${whole}.${cents < 10 ? `0${cents}` : cents}`;
  }
  const sign = format.sign ?? 'auto';
  const prefix = sign === 'never' ? '' : safe < 0 ? MINUS : sign === 'always' && safe > 0 ? '+' : '';
  return `${prefix}${info.symbol}${body}`;
}

/** Parses user text such as "1,250.5" into minor units. Returns null when invalid or out of range. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[,\s₹$€£¥]/g, '');
  if (!/^\d{1,12}(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const minor = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return isValidAmount(minor) ? minor : null;
}

export function isValidAmount(minor: unknown): minor is number {
  return typeof minor === 'number' && Number.isInteger(minor) && minor > 0 && minor <= LIMITS.amount;
}

/** Plain decimal string for payment links, e.g. 125050 -> "1250.50". */
export function toDecimalString(minor: number): string {
  const abs = Math.abs(Math.round(minor));
  const cents = abs % 100;
  return `${Math.floor(abs / 100)}.${cents < 10 ? `0${cents}` : cents}`;
}
