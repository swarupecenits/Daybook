import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Group, Row } from './form';
import { Icon } from './icon';
import { SectionLabel } from './layout';
import { Press } from './press';
import { Sheet } from './sheet';
import { isBlank } from '@/lib/notes';
import { copyText, shareText } from '@/lib/system';
import { noteAsText, noteTitle } from '@/lib/text';
import type { Note, PaperColor } from '@/lib/types';
import { deleteNote, setNoteArchived, toggleNotePin } from '@/stores/actions';
import { useNotes } from '@/stores/notes';
import { space, useTheme } from '@/theme';
import { PAPER_COLORS } from '@/theme/palette';

export const PAPER_NAMES: Record<PaperColor, string> = {
  plain: 'Plain',
  butter: 'Butter',
  sage: 'Sage',
  sky: 'Sky',
  blush: 'Blush',
  lilac: 'Lilac',
  sand: 'Sand',
};

/** Time for a sheet to finish leaving before iOS presents the share sheet or a screen pops. */
export const AFTER_SHEET_MS = 360;

type NoteSheetProps = {
  note: Note | undefined;
  visible: boolean;
  onClose: () => void;
  /** Runs when the note leaves its list: archived or moved to trash. */
  onGone?: () => void;
};

export function NoteSheet({ note, visible, onClose, onGone }: NoteSheetProps) {
  // Keeps the last note on screen while the sheet slides away, even if it was just destroyed.
  const [last, setLast] = useState(note);
  if (note && note !== last) setLast(note);
  const shown = note ?? last;
  if (!shown) return null;

  const blank = isBlank(shown);
  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <Sheet visible={visible && !!note} onClose={onClose} title={noteTitle(shown)} testID="note-sheet">
      <SectionLabel label="Paper" />
      <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Paper colour">
        {PAPER_COLORS.map((color) => (
          <Swatch
            key={color}
            color={color}
            selected={shown.color === color}
            onPress={() => useNotes.getState().update(shown.id, { color })}
          />
        ))}
      </View>
      <Group>
        <Row
          icon={shown.pinned ? 'push-pin-slash' : 'push-pin'}
          label={shown.pinned ? 'Unpin' : 'Pin to top'}
          detail={shown.archived ? 'Also brings it back from the archive' : undefined}
          onPress={act(() => toggleNotePin(shown.id))}
          testID="note-pin"
        />
        <Row
          icon="copy"
          label="Copy text"
          disabled={blank}
          onPress={act(() => void copyText(noteAsText(shown)))}
          testID="note-copy"
        />
        <Row
          icon="export"
          label="Share"
          disabled={blank}
          onPress={act(() => {
            const text = noteAsText(shown);
            const title = noteTitle(shown);
            setTimeout(() => void shareText(text, title), AFTER_SHEET_MS);
          })}
          testID="note-share"
        />
        <Row
          icon="archive"
          label={shown.archived ? 'Unarchive' : 'Archive'}
          onPress={act(() => {
            setNoteArchived(shown.id, !shown.archived);
            if (!shown.archived) onGone?.();
          })}
          testID="note-archive"
        />
        <Row
          icon="trash"
          label={blank ? 'Discard' : 'Move to trash'}
          danger
          onPress={act(() => {
            if (blank) useNotes.getState().destroy(shown.id);
            else deleteNote(shown.id);
            onGone?.();
          })}
          testID="note-delete"
        />
      </Group>
    </Sheet>
  );
}

function Swatch({ color, selected, onPress }: { color: PaperColor; selected: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <Press
      onPress={onPress}
      haptic="select"
      scale={0.9}
      hitSlop={4}
      accessibilityRole="radio"
      accessibilityLabel={`${PAPER_NAMES[color]} paper`}
      aria-checked={selected}
      testID={`paper-${color}`}
      style={[styles.ring, { borderColor: selected ? c.ink : 'transparent' }]}>
      <View style={[styles.swatch, { backgroundColor: c.paper[color], borderColor: c.paperEdge[color] }]}>
        {selected ? <Icon name="check" size={16} color={c.ink} weight="bold" /> : null}
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: space.sm,
    marginTop: space.sm,
    marginBottom: space.xl,
  },
  ring: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
