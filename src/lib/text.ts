import type { Note } from './types';

export type LineKind = 'heading' | 'todo' | 'done' | 'bullet' | 'quote' | 'text' | 'blank';
export type Line = { kind: LineKind; text: string; index: number };

const TODO_RE = /^(\s*)- \[( |x|X)\] ?(.*)$/;
const BULLET_RE = /^(\s*)[-•*] (.*)$/;
const NUMBER_RE = /^(\s*)(\d{1,3})[.)] (.*)$/;
const HEADING_RE = /^#{1,3} (.*)$/;
const QUOTE_RE = /^> ?(.*)$/;

export function parseLine(raw: string, index: number): Line {
  let m = TODO_RE.exec(raw);
  if (m) return { kind: m[2] === ' ' ? 'todo' : 'done', text: m[3], index };
  m = HEADING_RE.exec(raw);
  if (m) return { kind: 'heading', text: m[1], index };
  m = BULLET_RE.exec(raw);
  if (m) return { kind: 'bullet', text: m[2], index };
  m = QUOTE_RE.exec(raw);
  if (m) return { kind: 'quote', text: m[1], index };
  if (!raw.trim()) return { kind: 'blank', text: '', index };
  return { kind: 'text', text: raw, index };
}

export function parseLines(body: string): Line[] {
  return body.split('\n').map(parseLine);
}

export function toggleChecklist(body: string, index: number): string {
  const lines = body.split('\n');
  const line = lines[index];
  if (line === undefined) return body;
  const m = TODO_RE.exec(line);
  if (!m) return body;
  lines[index] = `${m[1]}- [${m[2] === ' ' ? 'x' : ' '}] ${m[3]}`;
  return lines.join('\n');
}

export function checklistStats(body: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const raw of body.split('\n')) {
    const m = TODO_RE.exec(raw);
    if (!m) continue;
    total += 1;
    if (m[2] !== ' ') done += 1;
  }
  return { done, total };
}

const TAG_RE = /(^|[\s(])#([^\s#.,;:!?()[\]{}"'`<>/\\]{1,32})/g;

export function extractTags(text: string): string[] {
  const tags = new Set<string>();
  for (const m of text.matchAll(TAG_RE)) tags.add(m[2].toLowerCase());
  return [...tags];
}

export function noteTitle(note: Pick<Note, 'title' | 'body'>): string {
  if (note.title.trim()) return note.title.trim();
  for (const raw of note.body.split('\n')) {
    const line = parseLine(raw, 0);
    if (line.text.trim()) return line.text.trim().slice(0, 80);
  }
  return 'Untitled';
}

/** Plain-text preview with list markers removed. Skips the line used as the derived title. */
export function snippet(note: Pick<Note, 'title' | 'body'>, max = 180): string {
  const lines = parseLines(note.body).filter((l) => l.kind !== 'blank');
  const rest = note.title.trim() ? lines : lines.slice(1);
  const text = rest
    .map((l) => (l.kind === 'todo' ? `\u25CB ${l.text}` : l.kind === 'done' ? `\u25CF ${l.text}` : l.text))
    .join(' \u00B7 ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}\u2026` : text;
}

/** Plain text for sharing: checklists and bullets become symbols that messaging apps show well. */
export function noteAsText(note: Pick<Note, 'title' | 'body'>): string {
  const body = parseLines(note.body)
    .map((l) => {
      if (l.kind === 'todo') return `\u2610 ${l.text}`;
      if (l.kind === 'done') return `\u2611 ${l.text}`;
      if (l.kind === 'bullet') return `\u2022 ${l.text}`;
      if (l.kind === 'quote') return `> ${l.text}`;
      return l.text;
    })
    .join('\n')
    .trim();
  const title = note.title.trim();
  return title && body ? `${title}\n\n${body}` : title || body;
}

export type Inline = { kind: 'text' | 'tag' | 'link'; text: string };

const INLINE_RE = /(https?:\/\/[^\s<>"'`]+)|(^|[\s(])#([^\s#.,;:!?()[\]{}"'`<>/\\]{1,32})/g;

/** Splits a line into plain runs, #tags and web links (http and https only). */
export function inlineTokens(text: string): Inline[] {
  const out: Inline[] = [];
  const push = (kind: Inline['kind'], value: string) => {
    if (!value) return;
    const prev = out[out.length - 1];
    if (kind === 'text' && prev?.kind === 'text') prev.text += value;
    else out.push({ kind, text: value });
  };
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    if (m[1]) {
      const url = m[1].replace(/[.,;:!?)\]}'"]+$/, '');
      push('text', text.slice(last, m.index));
      push('link', url);
      last = m.index + url.length;
    } else {
      push('text', text.slice(last, m.index + m[2].length));
      push('tag', `#${m[3]}`);
      last = m.index + m[0].length;
    }
  }
  push('text', text.slice(last));
  return out;
}

export function wordCount(text: string): number {
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
}

export function normalize(text: string): string {
  let lower = text.toLowerCase();
  try {
    lower = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    // Engines without full ICU: plain lowercase is good enough.
  }
  return lower;
}

export type Selection = { start: number; end: number };
export type Edit = { text: string; selection: Selection };
export type LineFormat = 'todo' | 'bullet' | 'heading' | 'quote';

const PREFIX: Record<LineFormat, string> = { todo: '- [ ] ', bullet: '- ', heading: '# ', quote: '> ' };

function stripPrefix(line: string): string {
  const todo = TODO_RE.exec(line);
  if (todo) return `${todo[1]}${todo[3]}`;
  const heading = HEADING_RE.exec(line);
  if (heading) return heading[1];
  const bullet = BULLET_RE.exec(line);
  if (bullet) return `${bullet[1]}${bullet[2]}`;
  const quote = QUOTE_RE.exec(line);
  if (quote) return quote[1];
  return line;
}

function hasFormat(line: string, format: LineFormat): boolean {
  const kind = parseLine(line, 0).kind;
  if (format === 'todo') return kind === 'todo' || kind === 'done';
  return kind === format;
}

/** Adds or removes a line prefix on every line touched by the selection. */
export function toggleLineFormat(text: string, sel: Selection, format: LineFormat): Edit {
  const from = sel.start > 0 ? text.lastIndexOf('\n', sel.start - 1) + 1 : 0;
  const nextBreak = text.indexOf('\n', sel.end);
  const to = nextBreak === -1 ? text.length : nextBreak;
  const block = text.slice(from, to).split('\n');
  const remove = block.every((line) => hasFormat(line, format) || !line.trim()) && block.some((l) => l.trim());
  const updated = block.map((line) => {
    const plain = stripPrefix(line);
    if (remove) return plain;
    if (!line.trim() && block.length > 1) return line;
    return `${PREFIX[format]}${plain}`;
  });
  const replaced = updated.join('\n');
  const result = text.slice(0, from) + replaced + text.slice(to);
  const delta = replaced.length - (to - from);
  const cursor = block.length === 1 ? Math.max(from, Math.min(sel.end + delta, from + replaced.length)) : from + replaced.length;
  return { text: result, selection: { start: cursor, end: cursor } };
}

/** The list or block format of the line holding the caret, if any. */
export function formatAt(text: string, pos: number): LineFormat | null {
  const start = pos > 0 ? text.lastIndexOf('\n', pos - 1) + 1 : 0;
  const end = text.indexOf('\n', pos);
  const kind = parseLine(text.slice(start, end === -1 ? text.length : end), 0).kind;
  if (kind === 'todo' || kind === 'done') return 'todo';
  return kind === 'bullet' || kind === 'heading' || kind === 'quote' ? kind : null;
}

export function insertAt(text: string, sel: Selection, insert: string): Edit {
  const result = text.slice(0, sel.start) + insert + text.slice(sel.end);
  const cursor = sel.start + insert.length;
  return { text: result, selection: { start: cursor, end: cursor } };
}

/**
 * Called when the user typed a single newline. Continues the list marker of the previous line,
 * or exits the list when the previous item was empty.
 */
export function continueList(prev: string, next: string): Edit | null {
  if (next.length !== prev.length + 1) return null;
  let i = 0;
  while (i < prev.length && prev[i] === next[i]) i++;
  if (next[i] !== '\n' || next.slice(i + 1) !== prev.slice(i)) return null;
  const lineStart = prev.lastIndexOf('\n', i - 1) + 1;
  const line = prev.slice(lineStart, i);

  let marker: string | null = null;
  let content = '';
  const todo = TODO_RE.exec(line);
  const number = NUMBER_RE.exec(line);
  const bullet = BULLET_RE.exec(line);
  if (todo) {
    marker = `${todo[1]}- [ ] `;
    content = todo[3];
  } else if (number) {
    marker = `${number[1]}${Number(number[2]) + 1}. `;
    content = number[3];
  } else if (bullet) {
    marker = `${bullet[1]}- `;
    content = bullet[2];
  }
  if (marker === null) return null;

  const lineEnd = prev.indexOf('\n', i);
  const rest = prev.slice(i, lineEnd === -1 ? prev.length : lineEnd);
  if (!content.trim() && !rest.trim()) {
    const text = prev.slice(0, lineStart) + prev.slice(i);
    return { text, selection: { start: lineStart, end: lineStart } };
  }
  const text = `${prev.slice(0, i)}\n${marker}${prev.slice(i)}`;
  const cursor = i + 1 + marker.length;
  return { text, selection: { start: cursor, end: cursor } };
}

/** First word of a name, for friendly copy like "Asha owes you". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** "Asha", "Asha and Ravi", "Asha, Ravi and Meera", "Asha, Ravi and 3 others". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}