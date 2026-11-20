import { balances, ledger, settlement, totals } from '../balances';
import { buildBackup, parseBackup } from '../backup';
import { detectIntent, parseExpenseIntent, parseMoneyIntent } from '../intent';
import { filterNotes, matchRanges, search } from '../search';
import { budgetStatus, byCategory } from '../spending';
import { checkSplit, linkedEntries, planEqualSplit, splitEqually } from '../split';
import { continueList, extractTags, formatAt, inlineTokens, noteAsText, toggleChecklist, toggleLineFormat } from '../text';
import type { Entry, Expense, Note, Person, Settings } from '../types';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const E1 = '33333333-3333-4333-8333-333333333333';

const entry = (id: string, personId: string, kind: Entry['kind'], amount: number, date: string, createdAt = 1): Entry => ({
  id,
  personId,
  kind,
  amount,
  date,
  note: '',
  expenseId: null,
  createdAt,
  updatedAt: createdAt,
  deletedAt: null,
});

const person = (id: string, name: string): Person => ({
  id,
  name,
  phone: '',
  upi: '',
  note: '',
  archived: false,
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
});

describe('split', () => {
  it('splits paise deterministically', () => {
    expect(splitEqually(100, 3)).toEqual([34, 33, 33]);
    expect(planEqualSplit(1000, [A, B], true)).toEqual({
      share: 334,
      split: [
        { personId: A, amount: 333 },
        { personId: B, amount: 333 },
      ],
    });
  });

  it('creates the right ledger entries', () => {
    const plan = planEqualSplit(90000, [A, B], true);
    const base = { id: E1, title: 'Dinner', date: '2025-08-12', ...plan };
    expect(linkedEntries({ ...base, paidBy: 'me' }).map((e) => [e.personId, e.kind, e.amount])).toEqual([
      [A, 'gave', 30000],
      [B, 'gave', 30000],
    ]);
    expect(linkedEntries({ ...base, paidBy: A }).map((e) => [e.personId, e.kind, e.amount])).toEqual([[A, 'got', 30000]]);
    expect(checkSplit({ amount: 90000, ...plan, paidBy: 'me' })).toBeNull();
    expect(checkSplit({ amount: 90001, ...plan, paidBy: 'me' })).toBe('sum');
  });
});

describe('balances', () => {
  const entries = [
    entry('1', A, 'gave', 50000, '2025-08-01'),
    entry('2', A, 'got', 20000, '2025-08-03'),
    entry('3', B, 'got', 10000, '2025-08-02'),
  ];

  it('sums per person and overall', () => {
    const map = balances(entries);
    expect(map.get(A)).toBe(30000);
    expect(map.get(B)).toBe(-10000);
    expect(totals(map)).toEqual({ owedToMe: 30000, iOwe: 10000, net: 20000, open: 2 });
    expect(settlement(30000)).toEqual({ kind: 'got', amount: 30000 });
  });

  it('builds a running ledger, newest first', () => {
    expect(ledger(entries, A).map((r) => r.balance)).toEqual([30000, 50000]);
  });
});

describe('spending', () => {
  it('projects the budget', () => {
    const s = budgetStatus(300000, 1000000, '2025-08', '2025-08-10');
    expect(s.daysLeft).toBe(22);
    expect(s.perDay).toBe(Math.floor(700000 / 22));
    expect(s.projected).toBe(Math.round((300000 / 10) * 31));
  });

  it('groups by category using my share', () => {
    const exp = (category: Expense['category'], share: number) => ({ category, share }) as Expense;
    expect(byCategory([exp('food', 100), exp('food', 50), exp('fun', 120)])).toEqual([
      { id: 'food', total: 150, count: 2 },
      { id: 'fun', total: 120, count: 1 },
    ]);
  });
});

describe('intent', () => {
  it('detects money between friends', () => {
    expect(parseMoneyIntent('lent 2k to amit for rent')).toEqual({ name: 'Amit', amount: 200000, kind: 'gave', note: 'rent' });
    expect(parseMoneyIntent('Rahul owes me 1.5k')).toMatchObject({ name: 'Rahul', amount: 150000, kind: 'gave' });
    expect(parseMoneyIntent('got 300 from Priya')).toMatchObject({ name: 'Priya', kind: 'got' });
    expect(parseMoneyIntent('I owe Rohan 250')).toMatchObject({ name: 'Rohan', kind: 'got', amount: 25000 });
    expect(parseMoneyIntent('gave 500 to me')).toBeNull();
  });

  it('detects expenses and everything else', () => {
    expect(parseExpenseIntent('spent 250 on lunch')).toEqual({ amount: 25000, title: 'Lunch', category: 'food' });
    expect(detectIntent('uber 340')).toBe('expense');
    expect(detectIntent('Rahul owes me 500')).toBe('money');
    expect(detectIntent('Call mom tomorrow')).toBe('task');
    expect(detectIntent('Meeting 3')).toBe('task');
    expect(detectIntent('note: app idea')).toBe('note');
    expect(detectIntent('did: shipped the release')).toBe('log');
  });
});

describe('text', () => {
  it('continues and exits lists', () => {
    expect(continueList('- [ ] a', '- [ ] a\n')).toEqual({ text: '- [ ] a\n- [ ] ', selection: { start: 14, end: 14 } });
    expect(continueList('- [ ] a\n- [ ] ', '- [ ] a\n- [ ] \n')).toEqual({ text: '- [ ] a\n', selection: { start: 8, end: 8 } });
    expect(continueList('1. a', '1. a\n')?.text).toBe('1. a\n2. ');
    expect(continueList('- [ ] a', '- [ ] \na')).toEqual({ text: '- [ ] \n- [ ] a', selection: { start: 13, end: 13 } });
    expect(continueList('plain', 'plain\n')).toBeNull();
  });

  it('toggles formats and checkboxes', () => {
    const on = toggleLineFormat('hello', { start: 5, end: 5 }, 'todo');
    expect(on.text).toBe('- [ ] hello');
    expect(toggleLineFormat(on.text, on.selection, 'todo').text).toBe('hello');
    expect(toggleLineFormat('a\nb', { start: 0, end: 3 }, 'bullet').text).toBe('- a\n- b');
    expect(toggleLineFormat('\nabc', { start: 0, end: 0 }, 'todo')).toEqual({
      text: '- [ ] \nabc',
      selection: { start: 6, end: 6 },
    });
    expect(toggleChecklist('- [ ] a\n- [x] b', 0)).toBe('- [x] a\n- [x] b');
    const doc = 'a\n- [x] b\n> c';
    expect([0, 4, 13].map((pos) => formatAt(doc, pos))).toEqual([null, 'todo', 'quote']);
    expect(formatAt('\n# h', 0)).toBeNull();
  });

  it('extracts tags', () => {
    expect(extractTags('Plan #Work and #home, not a#b or # heading')).toEqual(['work', 'home']);
  });

  it('formats notes for sharing', () => {
    const body = '# Pack\n- [ ] socks\n- [x] passport\n- charger\n\n> travel light\n';
    expect(noteAsText({ title: 'Trip', body })).toBe('Trip\n\nPack\n\u2610 socks\n\u2611 passport\n\u2022 charger\n\n> travel light');
    expect(noteAsText({ title: '', body: 'just this' })).toBe('just this');
    expect(noteAsText({ title: 'Only a title', body: ' \n' })).toBe('Only a title');
  });

  it('finds tags and web links inside a line', () => {
    expect(inlineTokens('See https://x.dev/a). #work (#home) a#b javascript:alert(1)')).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'link', text: 'https://x.dev/a' },
      { kind: 'text', text: '). ' },
      { kind: 'tag', text: '#work' },
      { kind: 'text', text: ' (' },
      { kind: 'tag', text: '#home' },
      { kind: 'text', text: ') a#b javascript:alert(1)' },
    ]);
    expect(inlineTokens('#start')).toEqual([{ kind: 'tag', text: '#start' }]);
  });
});

describe('backup', () => {
  const settings: Settings = {
    name: 'Swarup',
    currency: 'INR',
    theme: 'system',
    budget: 0,
    upi: '',
    weekStart: 1,
    haptics: true,
    remindByDefault: false,
    lock: true,
    lockGrace: 0,
    privacy: true,
    onboarded: true,
  };
  const note: Note = {
    id: E1,
    title: 'Hi',
    body: 'Body',
    color: 'sage',
    pinned: false,
    archived: false,
    createdAt: 1,
    updatedAt: 2,
    deletedAt: null,
  };

  it('round-trips and leaves device-only settings behind', () => {
    const text = buildBackup(
      { notes: [note], tasks: [], logs: [], people: [person(A, 'Amit')], entries: [entry(B, A, 'gave', 100, '2025-08-01')], expenses: [] },
      settings,
      5,
    );
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.notes).toEqual([note]);
    expect(parsed.data.entries).toHaveLength(1);
    expect(parsed.settings).not.toHaveProperty('lock');
    expect(parsed.skipped).toBe(0);
  });

  it('skips invalid and orphaned records and drops unknown keys', () => {
    const text = `{"format":"daybook-backup","version":1,"data":{"notes":[${JSON.stringify({ ...note, extra: 1 }).replace(
      /}$/,
      ',"__proto__":{"polluted":true}}',
    )},${JSON.stringify({ ...note, id: 'bad' })}],"entries":[${JSON.stringify(entry(B, A, 'gave', 100, '2025-08-01'))}]}}`;
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.notes).toHaveLength(1);
    expect(parsed.data.notes[0]).not.toHaveProperty('extra');
    expect(Object.getPrototypeOf(parsed.data.notes[0])).toBe(Object.prototype);
    expect(parsed.data.entries).toHaveLength(0);
    expect(parsed.skipped).toBe(2);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects other files', () => {
    expect(parseBackup('nope')).toMatchObject({ ok: false });
    expect(parseBackup('{"format":"x"}')).toMatchObject({ ok: false });
    expect(parseBackup('{"format":"daybook-backup","version":99,"data":{}}')).toMatchObject({ ok: false });
  });
});

describe('search', () => {
  it('ranks title matches above body matches', () => {
    const base = { color: 'plain', pinned: false, archived: false, createdAt: 1, updatedAt: 1, deletedAt: null } as const;
    const notes: Note[] = [
      { ...base, id: '1', title: 'Groceries', body: 'milk' },
      { ...base, id: '2', title: 'Trip', body: 'buy milk for the road' },
      { ...base, id: '3', title: 'Milk tea recipe', body: '' },
    ];
    const hits = search({ notes, tasks: [], logs: [], people: [], expenses: [] }, 'milk', '2025-08-12');
    expect(hits[0].id).toBe('3');
    expect(hits.map((h) => h.id).sort()).toEqual(['1', '2', '3']);
  });

  it('filters notes by every word, ignoring case and accents, keeping their order', () => {
    const base = { color: 'plain', pinned: false, archived: false, createdAt: 1, updatedAt: 1, deletedAt: null } as const;
    const notes: Note[] = [
      { ...base, id: '1', title: '', body: 'Café plan\nbook a table' },
      { ...base, id: '2', title: 'Plan', body: 'nothing else' },
      { ...base, id: '3', title: 'Table tennis', body: 'cafe after?' },
    ];
    expect(filterNotes(notes, '  ').map((n) => n.id)).toEqual(['1', '2', '3']);
    expect(filterNotes(notes, 'CAFE table').map((n) => n.id)).toEqual(['1', '3']);
    expect(filterNotes(notes, 'plan nothing').map((n) => n.id)).toEqual(['2']);
  });

  it('marks where each word matched in the original text', () => {
    const marks = (text: string, query: string) => matchRanges(text, query).map((r) => text.slice(r.start, r.end));
    expect(marks('Café, then CAFE again', 'cafe')).toEqual(['Café', 'CAFE']);
    // A decomposed accent stays with its letter, and emoji don't shift what comes after them.
    expect(marks('Cafe\u0301 🎉 party', 'party cafe')).toEqual(['Cafe\u0301', 'party']);
    // Overlapping and touching words become one mark.
    expect(marks('standup notes', 'stand standup')).toEqual(['standup']);
    expect(marks('notebook', 'note book')).toEqual(['notebook']);
    expect(matchRanges('anything', '   ')).toEqual([]);
  });
});
