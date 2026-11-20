import { parseTask } from '../parse-task';

const today = '2025-08-12'; // Tuesday
const parse = (text: string, now = '09:00', ignore?: Set<'date' | 'time' | 'priority' | 'tag' | 'repeat'>) =>
  parseTask(text, { today, now, weekStart: 1, ignore });

describe('parseTask', () => {
  it('reads date, time and priority', () => {
    const r = parse('Call mom tomorrow 5pm !!');
    expect(r).toMatchObject({ title: 'Call mom', dueDate: '2025-08-13', dueTime: '17:00', priority: 2 });
    expect(r.chips.map((c) => c.kind)).toEqual(['date', 'time', 'priority']);
  });

  it('reads worded priorities and leaves unknown ones in the title', () => {
    expect(parse('Call mom tomorrow 6pm !high #family')).toMatchObject({
      title: 'Call mom',
      priority: 3,
      tag: 'family',
      dueTime: '18:00',
    });
    expect(parse('Water plants !low').priority).toBe(1);
    expect(parse('Renew passport !Medium').priority).toBe(2);
    expect(parse('Say hi !wow')).toMatchObject({ title: 'Say hi !wow', priority: 0 });
  });

  it('reads repeat and tag, defaulting the date to today', () => {
    expect(parse('Pay rent every month #Home')).toMatchObject({
      title: 'Pay rent',
      repeat: 'monthly',
      tag: 'home',
      dueDate: today,
    });
  });

  it('resolves weekdays', () => {
    expect(parse('Submit report by friday').dueDate).toBe('2025-08-15');
    expect(parse('Gym next monday 7am')).toMatchObject({ title: 'Gym', dueDate: '2025-08-18', dueTime: '07:00' });
    expect(parse('Review tuesday').dueDate).toBe(today);
    expect(parse('Review next tuesday').dueDate).toBe('2025-08-19');
    expect(parse('Weekly sync every monday 11am')).toMatchObject({
      title: 'Weekly sync',
      repeat: 'weekly',
      dueDate: '2025-08-18',
      dueTime: '11:00',
    });
  });

  it('reads "next <day>" as that day of next week', () => {
    expect(parse('Ship this friday').dueDate).toBe('2025-08-15');
    expect(parse('Ship next friday').dueDate).toBe('2025-08-22');
    expect(parse('Plan next sunday').dueDate).toBe('2025-08-24');
    expect(parseTask('Plan next sunday', { today, now: '09:00', weekStart: 0 }).dueDate).toBe('2025-08-17');
  });

  it('only treats abbreviations as days after a preposition', () => {
    expect(parse('Fix sat dish').dueDate).toBeNull();
    expect(parse('Meet on sat').dueDate).toBe('2025-08-16');
  });

  it('puts a bare time today or tomorrow depending on the clock', () => {
    expect(parse('Standup at 10:30', '09:00')).toMatchObject({ title: 'Standup', dueDate: today, dueTime: '10:30' });
    expect(parse('Standup at 10:30', '11:00').dueDate).toBe('2025-08-13');
    expect(parse('Call at 5').dueTime).toBe('17:00');
    expect(parse('Lunch noon').dueTime).toBe('12:00');
  });

  it('reads calendar dates and rolls past ones to next year', () => {
    expect(parse('Dentist 3 sept').dueDate).toBe('2025-09-03');
    expect(parse('Dentist sep 3rd').dueDate).toBe('2025-09-03');
    expect(parse('Taxes 31/3').dueDate).toBe('2026-03-31');
    expect(parse('Pay 31/2').dueDate).toBeNull();
  });

  it('reads relative phrases', () => {
    expect(parse('Email in 3 days').dueDate).toBe('2025-08-15');
    expect(parse('Plan next week').dueDate).toBe('2025-08-18');
    expect(parse('Ship tomorrow morning')).toMatchObject({ dueDate: '2025-08-13', dueTime: '09:00' });
    expect(parse('Movie tonight')).toMatchObject({ title: 'Movie', dueDate: today, dueTime: '20:00' });
  });

  it('skips ignored kinds and keeps the words in the title', () => {
    const r = parse('Buy milk tomorrow', '09:00', new Set(['date']));
    expect(r).toMatchObject({ title: 'Buy milk tomorrow', dueDate: null });
  });

  it('cleans punctuation left behind', () => {
    expect(parse('Call mom, tomorrow.').title).toBe('Call mom');
    expect(parse('Is it done ?').title).toBe('Is it done?');
  });

  it('moves weekday repeats off weekends', () => {
    expect(parseTask('Standup weekdays', { today: '2025-08-16', now: '09:00' }).dueDate).toBe('2025-08-18');
  });
});
