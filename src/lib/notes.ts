import { extractTags, normalize } from './text';
import type { Note } from './types';

export type NoteFilter = { archived?: boolean; tag?: string | null };

export function visibleNotes(notes: readonly Note[], filter: NoteFilter = {}): Note[] {
  const archived = filter.archived ?? false;
  const tag = filter.tag ? normalize(filter.tag) : null;
  return notes
    .filter((n) => n.deletedAt === null && n.archived === archived)
    .filter((n) => !tag || extractTags(`${n.title}\n${n.body}`).includes(tag))
    .sort((a, b) => (a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : b.updatedAt - a.updatedAt));
}

export function noteTags(notes: readonly Note[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const n of notes) {
    if (n.deletedAt !== null || n.archived) continue;
    for (const tag of extractTags(`${n.title}\n${n.body}`)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function isBlank(note: Pick<Note, 'title' | 'body'>): boolean {
  return !note.title.trim() && !note.body.trim();
}
