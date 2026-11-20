import { formatDay } from './dates';
import { noteTitle, normalize, snippet } from './text';
import type { DayKey, Expense, LogItem, Note, Person, Task } from './types';

export type HitKind = 'note' | 'task' | 'log' | 'person' | 'expense';

export type SearchHit = {
  kind: HitKind;
  id: string;
  title: string;
  detail: string;
  score: number;
  /** Day for logs, so the result can open the right Today page. */
  day?: DayKey;
};

export type SearchSource = {
  notes: readonly Note[];
  tasks: readonly Task[];
  logs: readonly LogItem[];
  people: readonly Person[];
  expenses: readonly Expense[];
};

const cache = new WeakMap<object, [string, string]>();

/** Normalised [title, body] per record. Records are immutable, so identity is a safe cache key. */
function haystack(record: object, build: () => [string, string]): [string, string] {
  let value = cache.get(record);
  if (value === undefined) {
    const [title, body] = build();
    value = [normalize(title), normalize(body)];
    cache.set(record, value);
  }
  return value;
}

function scoreText(title: string, body: string, tokens: string[], full: string): number {
  let score = 0;
  for (const token of tokens) {
    const inTitle = title.indexOf(token);
    if (inTitle === 0) score += 40;
    else if (inTitle > 0) score += title[inTitle - 1] === ' ' ? 30 : 20;
    else if (body.includes(token)) score += 8;
    else return 0;
  }
  if (title === full) score += 60;
  else if (title.startsWith(full)) score += 25;
  return score;
}

function excerpt(text: string, token: string, radius = 48): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = normalize(flat).indexOf(token);
  if (at < 0) return flat.slice(0, radius * 2);
  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + token.length + radius);
  return `${start > 0 ? '\u2026' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '\u2026' : ''}`;
}

/** Notes containing every word of the query, in their original order. */
export function filterNotes(notes: readonly Note[], query: string): readonly Note[] {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return notes;
  return notes.filter((n) => {
    const [t, b] = haystack(n, () => [noteTitle(n), n.body]);
    return tokens.every((token) => t.includes(token) || b.includes(token));
  });
}

export function search(source: SearchSource, query: string, today: DayKey, limit = 40): SearchHit[] {
  const full = normalize(query.trim().replace(/\s+/g, ' '));
  if (!full) return [];
  const tokens = full.split(' ').filter(Boolean);
  const hits: SearchHit[] = [];
  const recency = (ts: number) => Math.min(6, Math.max(0, 6 - (Date.now() - ts) / (14 * 86_400_000)));

  for (const n of source.notes) {
    if (n.deletedAt !== null) continue;
    const title = noteTitle(n);
    const [t, b] = haystack(n, () => [title, n.body]);
    const score = scoreText(t, b, tokens, full);
    if (score > 0) {
      const detail = b.includes(tokens[0]) && !t.includes(tokens[0]) ? excerpt(n.body, tokens[0]) : snippet(n, 96);
      hits.push({ kind: 'note', id: n.id, title, detail, score: score + recency(n.updatedAt) + (n.pinned ? 3 : 0) });
    }
  }
  for (const task of source.tasks) {
    if (task.deletedAt !== null) continue;
    const [t, b] = haystack(task, () => [
      `${task.title} ${task.tag ? `#${task.tag}` : ''}`,
      `${task.notes} ${task.subtasks.map((s) => s.title).join(' ')}`,
    ]);
    const score = scoreText(t, b, tokens, full);
    if (score > 0) {
      const when = task.doneAt ? 'Done' : task.dueDate ? formatDay(task.dueDate, today) : 'Anytime';
      hits.push({ kind: 'task', id: task.id, title: task.title, detail: when, score: score + (task.doneAt ? 0 : 4) });
    }
  }
  for (const log of source.logs) {
    if (log.deletedAt !== null) continue;
    const [t] = haystack(log, () => [log.text, '']);
    const score = scoreText(t, '', tokens, full);
    if (score > 0) {
      hits.push({ kind: 'log', id: log.id, title: log.text, detail: formatDay(log.day, today), score, day: log.day });
    }
  }
  for (const p of source.people) {
    if (p.deletedAt !== null) continue;
    const [t, b] = haystack(p, () => [p.name, `${p.note} ${p.phone} ${p.upi}`]);
    const score = scoreText(t, b, tokens, full);
    if (score > 0) hits.push({ kind: 'person', id: p.id, title: p.name, detail: 'Friend', score: score + 10 });
  }
  for (const e of source.expenses) {
    if (e.deletedAt !== null) continue;
    const [t, b] = haystack(e, () => [e.title, e.note]);
    const score = scoreText(t, b, tokens, full);
    if (score > 0) {
      hits.push({ kind: 'expense', id: e.id, title: e.title, detail: formatDay(e.date, today), score });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export type Range = { start: number; end: number };

/**
 * Where the words of `query` appear in `text`, as sorted, merged ranges of the original string.
 * Case- and accent-insensitive like search itself; a range never splits a letter from its accents.
 */
export function matchRanges(text: string, query: string, max = 12): Range[] {
  const tokens = [...new Set(normalize(query).split(/\s+/).filter(Boolean))];
  if (!tokens.length || !text) return [];

  // Normalise one character at a time, remembering which original characters each unit came from.
  let flat = '';
  const from: number[] = [];
  const to: number[] = [];
  for (let i = 0; i < text.length; ) {
    const width = (text.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
    const piece = normalize(text.slice(i, i + width));
    if (!piece && to.length) to[to.length - 1] = i + width;
    for (let k = 0; k < piece.length; k++) {
      from.push(i);
      to.push(i + width);
    }
    flat += piece;
    i += width;
  }

  const found: Range[] = [];
  for (const token of tokens) {
    for (let at = flat.indexOf(token); at >= 0 && found.length < max * 4; at = flat.indexOf(token, at + token.length)) {
      found.push({ start: from[at], end: to[at + token.length - 1] });
    }
  }
  found.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Range[] = [];
  for (const r of found) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged.slice(0, max);
}