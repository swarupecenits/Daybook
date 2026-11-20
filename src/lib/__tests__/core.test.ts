import { evaluate, pressKey } from '../calc';
import { addMonths, diffDays, formatDay, formatTime, monthGrid } from '../dates';
import { formatMoney, parseAmount } from '../money';
import { nextDue } from '../repeat';

describe('money', () => {
  it('formats with Indian grouping and signs', () => {
    expect(formatMoney(123456789, 'INR')).toBe('₹12,34,567.89');
    expect(formatMoney(100000, 'INR')).toBe('₹1,000');
    expect(formatMoney(-50000, 'INR')).toBe('\u2212₹500');
    expect(formatMoney(50000, 'INR', { sign: 'always' })).toBe('+₹500');
    expect(formatMoney(15_000_000, 'INR', { compact: true })).toBe('₹1.5L');
    expect(formatMoney(123456789, 'USD')).toBe('$1,234,567.89');
    expect(formatMoney(123400, 'JPY')).toBe('¥1,234');
  });

  it('parses user input strictly', () => {
    expect(parseAmount('1,250.5')).toBe(125050);
    expect(parseAmount('₹ 99')).toBe(9900);
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('12.345')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
});

describe('calc', () => {
  it('evaluates with precedence and without eval', () => {
    expect(evaluate('1200+350×2')).toBe(190000);
    expect(evaluate('10÷4')).toBe(250);
    expect(evaluate('12+')).toBe(1200);
    expect(evaluate('5÷0')).toBeNull();
    expect(evaluate('100-200')).toBeNull();
    expect(evaluate('2;alert(1)')).toBeNull();
  });

  it('builds expressions key by key', () => {
    expect(pressKey('', '+')).toBe('');
    expect(pressKey('12+', '×')).toBe('12×');
    expect(pressKey('1.25', '5')).toBe('1.25');
    expect(pressKey('0', '5')).toBe('5');
    expect(pressKey('', '.')).toBe('0.');
    expect(pressKey('100+50', '=')).toBe('150');
  });
});

describe('dates', () => {
  it('handles month ends and DST', () => {
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(diffDays('2025-03-29', '2025-03-31')).toBe(2);
    expect(diffDays('2025-10-25', '2025-10-27')).toBe(2);
  });

  it('builds a month grid starting on the configured weekday', () => {
    const grid = monthGrid('2025-08', 1);
    expect(grid[0][0]).toBe('2025-07-28');
    expect(grid).toHaveLength(5);
    expect(grid[4][6]).toBe('2025-08-31');
  });

  it('formats days and times', () => {
    expect(formatDay('2025-08-13', '2025-08-12')).toBe('Tomorrow');
    expect(formatDay('2025-08-20', '2025-08-12')).toBe('Wed, 20 Aug');
    expect(formatDay('2026-01-02', '2025-08-12')).toBe('Fri, 2 Jan 2026');
    expect(formatTime('17:30')).toBe('5:30 pm');
    expect(formatTime('09:00')).toBe('9 am');
    expect(formatTime('00:15')).toBe('12:15 am');
  });
});

describe('repeat', () => {
  it('keeps monthly series on their anchor day', () => {
    expect(nextDue('2025-01-31', 'monthly', null, '2025-01-31')).toBe('2025-02-28');
    expect(nextDue('2025-02-28', 'monthly', 31, '2025-02-28')).toBe('2025-03-31');
    expect(nextDue('2024-02-29', 'yearly', null, '2024-02-29')).toBe('2025-02-28');
    expect(nextDue('2027-02-28', 'yearly', 29, '2027-02-28')).toBe('2028-02-29');
  });

  it('skips weekends and catches up overdue series', () => {
    expect(nextDue('2025-08-15', 'weekdays', null, '2025-08-15')).toBe('2025-08-18');
    expect(nextDue('2025-08-01', 'daily', null, '2025-08-12')).toBe('2025-08-13');
    expect(nextDue('2025-08-04', 'weekly', null, '2025-08-12')).toBe('2025-08-18');
    expect(nextDue('2025-08-20', 'daily', null, '2025-08-12')).toBe('2025-08-21');
    expect(nextDue('2025-08-12', 'none', null, '2025-08-12')).toBeNull();
  });
});
