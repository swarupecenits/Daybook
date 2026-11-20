import {
  amountWithin,
  captureIntent,
  matchFriend,
  noteFromText,
  planCapture,
  splitDayWord,
  type CaptureContext,
} from '../capture';
import { detectIntent, parseLooseMoney, splitPrefix } from '../intent';
import type { Expense, Person } from '../types';

const person = (id: string, name: string, extra: Partial<Person> = {}): Person => ({
  id,
  name,
  phone: '',
  upi: '',
  note: '',
  archived: false,
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
  ...extra,
});

const expense = (id: string, method: Expense['method'], createdAt: number): Expense => ({
  id,
  title: 'Lunch',
  amount: 100,
  share: 100,
  category: 'food',
  method,
  date: '2026-03-09',
  note: '',
  paidBy: 'me',
  split: [],
  createdAt,
  updatedAt: createdAt,
  deletedAt: null,
});

const SHARMA = person('p1', 'Rahul Sharma');
const VERMA = person('p2', 'Rahul Verma');
const ASHA = person('p3', 'Asha Rao');

const ctx = (over: Partial<CaptureContext> = {}): CaptureContext => ({
  today: '2026-03-10',
  now: '09:00',
  weekStart: 1,
  day: null,
  ignore: new Set(),
  people: [SHARMA, VERMA, ASHA],
  expenses: [],
  pick: null,
  ...over,
});

describe('intent rules for quick capture', () => {
  it('reads time spent as a work log and needs an amount before calling it spending', () => {
    expect(detectIntent('spent 2h on code review')).toBe('log');
    expect(detectIntent('Spent the whole day on the migration')).toBe('log');
    expect(detectIntent('spent the evening with family')).toBe('task');
    expect(detectIntent('spent 2k on shoes')).toBe('expense');
    expect(detectIntent('paid 1200 for stuff')).toBe('expense');
    expect(detectIntent('₹500')).toBe('expense');
    expect(detectIntent('500')).toBe('expense');
  });

  it('parses loosely phrased money and leaves direction open when unsaid', () => {
    expect(parseLooseMoney('Rahul 500 dinner')).toEqual({ name: 'Rahul', amount: 50000, kind: null, note: 'dinner' });
    expect(parseLooseMoney('500 to asha')).toMatchObject({ name: 'Asha', kind: 'gave' });
    expect(parseLooseMoney('1.2k from Asha for cab')).toEqual({ name: 'Asha', amount: 120000, kind: 'got', note: 'cab' });
    expect(parseLooseMoney('lent asha 500')).toMatchObject({ kind: 'gave', amount: 50000 });
    expect(parseLooseMoney('500 for dinner')).toBeNull();
  });

  it('splits command prefixes', () => {
    expect(splitPrefix('note: idea')).toEqual({ intent: 'note', key: 'note', rest: 'idea' });
    expect(splitPrefix('spent: 500 lunch')).toMatchObject({ intent: 'expense', rest: '500 lunch' });
    expect(splitPrefix('notes about the offsite')).toBeNull();
  });

  it('finds a past day named at either end', () => {
    expect(splitDayWord('lunch 250 yesterday')).toEqual({ text: 'lunch 250', back: 1 });
    expect(splitDayWord('yesterday: lent Asha 500')).toEqual({ text: 'lent Asha 500', back: 1 });
    expect(splitDayWord('day before yesterday uber 300')).toEqual({ text: 'uber 300', back: 2 });
    expect(splitDayWord('chai 20 today')).toEqual({ text: 'chai 20', back: 0 });
    expect(splitDayWord("yesterday's notes").back).toBeNull();
  });

  it('takes a lone amount from anywhere in the words', () => {
    expect(amountWithin('uber 180 to the airport')).toEqual({ amount: 18000, rest: 'uber to the airport' });
    expect(amountWithin('lunch ₹1.5k with team')).toEqual({ amount: 150000, rest: 'lunch with team' });
    expect(amountWithin('2 coffees 450 at starbucks')).toBeNull();
    expect(amountWithin('call at 10am')).toBeNull();
  });
});

describe('matchFriend', () => {
  it('prefers full names, borrowing words from the note', () => {
    expect(matchFriend([SHARMA, VERMA], 'Rahul', 'sharma for dinner')).toEqual({
      person: SHARMA,
      name: 'Rahul Sharma',
      note: 'dinner',
      choices: [],
    });
  });

  it('asks when a first name fits several friends', () => {
    const match = matchFriend([SHARMA, VERMA, ASHA], 'rahul', 'cab');
    expect(match.person).toBeNull();
    expect(match.choices.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(matchFriend([SHARMA, VERMA, ASHA], 'asha').person).toBe(ASHA);
  });

  it('falls back to archived friends and ignores deleted ones', () => {
    const archived = person('p4', 'Meera Iyer', { archived: true });
    const gone = person('p5', 'Meera Das', { deletedAt: 5 });
    expect(matchFriend([archived, gone], 'meera').person).toBe(archived);
    const active = person('p6', 'Meera Nair');
    expect(matchFriend([archived, active], 'meera').person).toBe(active);
    expect(matchFriend([gone], 'meera Das').person).toBeNull();
  });
});

describe('captureIntent', () => {
  it('turns a friend and an amount into money', () => {
    expect(captureIntent('asha 500 cab', [ASHA])).toBe('money');
    expect(captureIntent('rahul 500', [SHARMA, VERMA])).toBe('money');
    expect(captureIntent('asha 500 cab', [])).toBe('task');
  });

  it('sees through day words and sends long lines to notes', () => {
    expect(captureIntent('lunch 250 yesterday', [])).toBe('expense');
    expect(captureIntent('lent asha 500 yesterday', [])).toBe('money');
    expect(captureIntent('pay rent today', [])).toBe('task');
    expect(captureIntent('word '.repeat(50), [])).toBe('note');
  });
});

describe('noteFromText', () => {
  it('titles a note from a short first line only when more follows', () => {
    expect(noteFromText('Groceries\n\n- [ ] milk')).toEqual({ title: 'Groceries', body: '- [ ] milk' });
    expect(noteFromText('# Ideas\nship it')).toEqual({ title: 'Ideas', body: 'ship it' });
    expect(noteFromText('- [ ] milk\n- [ ] eggs')).toEqual({ title: '', body: '- [ ] milk\n- [ ] eggs' });
    expect(noteFromText('  just one line  ')).toEqual({ title: '', body: 'just one line' });
  });
});

describe('planCapture', () => {
  it('waits for a pick when a first name is ambiguous', () => {
    const open = planCapture('money', 'rahul 500 cab', ctx());
    expect(open).toMatchObject({ ready: false, person: null, kind: null, name: 'Rahul', note: 'cab' });
    const picked = planCapture('money', 'rahul 500 cab', ctx({ pick: 'p2' }));
    expect(picked).toMatchObject({ ready: true, person: VERMA, name: 'Rahul Verma', amount: 50000 });
  });

  it('dates money by its day word, else the past day it was opened for', () => {
    expect(planCapture('money', 'lent asha 500 yesterday', ctx())).toMatchObject({
      ready: true,
      person: ASHA,
      kind: 'gave',
      day: '2026-03-09',
    });
    expect(planCapture('money', 'got 200 from Ravi', ctx({ day: '2026-03-12' }))).toMatchObject({
      ready: true,
      person: null,
      name: 'Ravi',
      kind: 'got',
      day: '2026-03-10',
    });
    expect(planCapture('money', '500', ctx())).toMatchObject({ ready: false, amount: 50000, name: '' });
  });

  it('plans expenses with the category guessed and the last method reused', () => {
    const expenses = [expense('e1', 'card', 1), expense('e2', 'cash', 2)];
    expect(planCapture('expense', 'spent 500', ctx({ expenses }))).toMatchObject({
      ready: true,
      amount: 50000,
      title: '',
      category: 'other',
      method: 'cash',
    });
    expect(planCapture('expense', 'uber 180 to the airport yesterday', ctx())).toMatchObject({
      ready: true,
      amount: 18000,
      title: 'Uber to the airport',
      category: 'transport',
      method: 'upi',
      day: '2026-03-09',
    });
    expect(planCapture('expense', 'dinner with the team', ctx())).toMatchObject({ ready: false, amount: null });
  });

  it('gives tasks the day capture was opened for, but never a past one', () => {
    const plan = (day: string | null, text = 'buy milk') => planCapture('task', text, ctx({ day }));
    expect(plan('2026-03-12')).toMatchObject({ ready: true, dueDate: '2026-03-12', fallback: true });
    expect(plan('2026-03-01')).toMatchObject({ dueDate: '2026-03-10', fallback: true });
    expect(plan(null)).toMatchObject({ dueDate: null, fallback: false });
    expect(plan(null, 'water plants every day')).toMatchObject({ dueDate: '2026-03-10' });
    expect(plan('2026-03-12', 'call bank tomorrow')).toMatchObject({ dueDate: '2026-03-11', fallback: false });
  });

  it('keeps logs in the past and notes whole', () => {
    expect(planCapture('log', '  shipped   the release ', ctx({ day: '2026-03-08' }))).toEqual({
      intent: 'log',
      ready: true,
      text: 'shipped the release',
      day: '2026-03-08',
    });
    expect(planCapture('note', 'Offsite\nagenda #work', ctx())).toMatchObject({
      ready: true,
      title: 'Offsite',
      body: 'agenda #work',
      tags: ['work'],
    });
  });
});
