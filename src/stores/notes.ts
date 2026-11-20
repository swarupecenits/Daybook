import { create } from 'zustand';

import { persist } from './persist';
import { findById, upsertIn, withoutIds } from './util';
import { notesTable } from '@/db/repos';
import { newId } from '@/lib/ids';
import { clip, LIMITS } from '@/lib/limits';
import type { Note, PaperColor } from '@/lib/types';
import { PAPER_COLORS } from '@/theme/palette';

export type NoteDraft = {
  title: string;
  body: string;
  color: PaperColor;
  pinned: boolean;
  archived: boolean;
};

type NotesState = {
  notes: Note[];
  create(draft?: Partial<NoteDraft>): Note | null;
  update(id: string, patch: Partial<NoteDraft>): void;
  remove(id: string): void;
  restore(id: string): void;
  destroy(id: string): void;
};

function sanitize(patch: Partial<NoteDraft>): Partial<NoteDraft> {
  const out: Partial<NoteDraft> = {};
  if (patch.title !== undefined) out.title = clip(patch.title.replace(/[\r\n]+/g, ' '), LIMITS.title);
  if (patch.body !== undefined) out.body = clip(patch.body.replace(/\u0000/g, ''), LIMITS.body);
  if (patch.color !== undefined && PAPER_COLORS.includes(patch.color)) out.color = patch.color;
  if (patch.pinned !== undefined) out.pinned = patch.pinned;
  if (patch.archived !== undefined) out.archived = patch.archived;
  return out;
}

export const useNotes = create<NotesState>()((set, get) => {
  const write = (next: Note): boolean => {
    if (!persist(() => notesTable.save(next))) return false;
    set({ notes: upsertIn(get().notes, next) });
    return true;
  };

  return {
    notes: [],

    create(draft = {}) {
      const now = Date.now();
      const note: Note = {
        id: newId(),
        title: '',
        body: '',
        color: 'plain',
        pinned: false,
        archived: false,
        ...sanitize(draft),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      return write(note) ? note : null;
    },

    update(id, patch) {
      const prev = findById(get().notes, id);
      if (!prev) return;
      const clean = sanitize(patch);
      const keys = Object.keys(clean) as (keyof NoteDraft)[];
      if (keys.every((k) => clean[k] === prev[k])) return;
      // Archiving takes a note off the pinned shelf.
      if (clean.archived) clean.pinned = false;
      write({ ...prev, ...clean, updatedAt: Date.now() });
    },

    remove(id) {
      const prev = findById(get().notes, id);
      if (!prev || prev.deletedAt !== null) return;
      const now = Date.now();
      write({ ...prev, deletedAt: now, updatedAt: now });
    },

    restore(id) {
      const prev = findById(get().notes, id);
      if (!prev || prev.deletedAt === null) return;
      write({ ...prev, deletedAt: null, updatedAt: Date.now() });
    },

    destroy(id) {
      if (!persist(() => notesTable.destroy([id]))) return;
      set({ notes: withoutIds(get().notes, [id]) });
    },
  };
});
