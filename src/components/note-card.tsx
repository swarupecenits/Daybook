import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { Press } from './press';
import { T } from './text';
import { relativeTime } from '@/lib/dates';
import { checklistStats, extractTags, noteTitle, snippet } from '@/lib/text';
import type { Note } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

type NoteCardProps = {
  note: Note;
  now: number;
  onPress: (note: Note) => void;
  onLongPress?: (note: Note) => void;
  /** Fixed width for horizontal shelves; grid cards fill their column. */
  width?: number;
  lines?: number;
};

function NoteCardBase({ note, now, onPress, onLongPress, width, lines = 7 }: NoteCardProps) {
  const c = useTheme();
  const title = noteTitle(note);
  const preview = snippet(note, 260);
  const { done, total } = checklistStats(note.body);
  const tags = extractTags(`${note.title}\n${note.body}`).slice(0, 3);
  const plain = note.color === 'plain';
  return (
    <Press
      onPress={() => onPress(note)}
      onLongPress={onLongPress ? () => onLongPress(note) : undefined}
      delayLongPress={320}
      scale={0.97}
      accessibilityLabel={`${note.pinned ? 'Pinned note' : 'Note'}: ${title}. ${preview}`}
      accessibilityHint={onLongPress ? 'Long press for options' : undefined}
      testID={`note-${note.id}`}
      style={[
        styles.card,
        width ? { width } : null,
        {
          backgroundColor: c.paper[note.color],
          borderColor: plain ? c.line : `${c.paperEdge[note.color]}59`,
        },
      ]}>
      <View style={styles.head}>
        <T variant="headline" numberOfLines={3} style={styles.title}>
          {title}
        </T>
        {note.pinned ? <Icon name="push-pin" size={15} color={c.ink2} weight="fill" /> : null}
      </View>
      {preview ? (
        <T variant="callout" color="ink2" numberOfLines={lines}>
          {preview}
        </T>
      ) : null}
      {total > 0 ? (
        <View style={styles.progress}>
          <Icon name="check-square" size={14} color={done === total ? c.positive : c.ink3} weight="bold" />
          <T variant="small" color={done === total ? 'positive' : 'ink3'}>
            {done}/{total}
          </T>
          <View style={[styles.rail, { backgroundColor: `${c.ink}14` }]}>
            <View style={[styles.fill, { width: `${(done / total) * 100}%`, backgroundColor: done === total ? c.positive : c.ink2 }]} />
          </View>
        </View>
      ) : null}
      <View style={styles.foot}>
        {tags.length ? (
          <T variant="small" color="accent" numberOfLines={1} style={styles.tags}>
            {tags.map((t) => `#${t}`).join(' ')}
          </T>
        ) : (
          <View style={styles.tags} />
        )}
        <T variant="small" color="ink3" numberOfLines={1}>
          {relativeTime(note.updatedAt, now)}
        </T>
      </View>
    </Press>
  );
}

export const NoteCard = memo(NoteCardBase);

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md + 2,
    gap: space.sm,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  title: { flex: 1 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rail: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  tags: { flex: 1 },
});
