import { LIMITS } from './limits';

export type CalcKey =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '.'
  | '+'
  | '-'
  | '×'
  | '÷'
  | 'back'
  | 'clear'
  | '=';

const OPERATORS = new Set(['+', '-', '×', '÷']);
const MAX_LENGTH = 48;

type Token = number | '+' | '-' | '×' | '÷';

function tokenize(expr: string): Token[] | null {
  const tokens: Token[] = [];
  const re = /(\d+(?:\.\d*)?|\.\d+)|([+\-×÷])|(\s+)|(.)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(expr))) {
    if (match[1] !== undefined) tokens.push(Number(match[1]));
    else if (match[2] !== undefined) tokens.push(match[2] as Token);
    else if (match[4] !== undefined) return null;
  }
  return tokens;
}

/**
 * Evaluates a keypad expression such as "1200+350×2" with normal operator precedence.
 * Returns the result in minor units, or null when empty, invalid, negative or out of range.
 * Never uses eval.
 */
export function evaluate(expr: string): number | null {
  const tokens = tokenize(expr);
  if (!tokens || tokens.length === 0) return null;
  while (tokens.length && typeof tokens[tokens.length - 1] !== 'number') tokens.pop();
  if (tokens.length === 0 || typeof tokens[0] !== 'number') return null;

  const terms: number[] = [];
  const signs: number[] = [];
  let current = tokens[0] as number;
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const value = tokens[i + 1];
    if (typeof op === 'number' || typeof value !== 'number') return null;
    if (op === '×') current *= value;
    else if (op === '÷') {
      if (value === 0) return null;
      current /= value;
    } else {
      terms.push(current);
      signs.push(op === '-' ? -1 : 1);
      current = value;
    }
  }
  let total = terms.length ? terms[0] : current;
  if (terms.length) {
    for (let i = 1; i < terms.length; i++) total += signs[i - 1] * terms[i];
    total += signs[signs.length - 1] * current;
  }
  if (!Number.isFinite(total)) return null;
  const minor = Math.round(total * 100);
  if (minor <= 0 || minor > LIMITS.amount) return null;
  return minor;
}

export function hasOperator(expr: string): boolean {
  return /\d[+\-×÷]\d/.test(expr);
}

function currentNumber(expr: string): string {
  const m = /(\d*\.?\d*)$/.exec(expr);
  return m ? m[1] : '';
}

export function minorToInput(minor: number): string {
  const units = Math.floor(minor / 100);
  const cents = minor % 100;
  if (cents === 0) return String(units);
  return `${units}.${cents < 10 ? `0${cents}` : cents}`.replace(/0$/, '');
}

export function pressKey(expr: string, key: CalcKey): string {
  if (key === 'clear') return '';
  if (key === 'back') return expr.slice(0, -1);
  if (key === '=') {
    const value = evaluate(expr);
    return value === null ? expr : minorToInput(value);
  }
  if (expr.length >= MAX_LENGTH) return expr;
  const last = expr.slice(-1);

  if (OPERATORS.has(key)) {
    if (!expr) return expr;
    if (OPERATORS.has(last)) return expr.slice(0, -1) + key;
    if (last === '.') return expr.slice(0, -1) + key;
    return expr + key;
  }

  const num = currentNumber(expr);
  if (key === '.') {
    if (num.includes('.')) return expr;
    return expr + (num === '' ? '0.' : '.');
  }

  // digit
  const [whole, frac] = num.split('.');
  if (frac !== undefined && frac.length >= 2) return expr;
  if (frac === undefined && whole.length >= 10) return expr;
  if (num === '0') return expr.slice(0, -1) + key;
  return expr + key;
}

export function formatExpression(expr: string): string {
  return expr.replace(/([+\-×÷])/g, ' $1 ').replace(/-/g, '−');
}
