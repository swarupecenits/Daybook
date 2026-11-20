import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { webInput } from '@/components/form';
import { Icon } from '@/components/icon';
import { PageHeader, SectionLabel } from '@/components/layout';
import { NoteCard } from '@/components/note-card';
import { NoteSheet } from '@/components/note-sheet';
import { useTabBarClearance } from '@/components/tab-bar';
import { haptic } from '@/lib/haptics';
import { isBlank, noteTags, visibleNotes } from '@/lib/notes';
import { filterNotes } from '@/lib/search';
import { extractTags } from '@/lib/text';
import type { Note } from '@/lib/types';
import { useClock } from '@/stores/clock';
import { useNotes } from '@/stores/notes';
import { radius, space, typo, useTheme } from '@/theme';

type Item =
  | { kind: 'label'; key: string; label: string; first: boolean }
  | { kind: 'note'; key: string; note: Note };

/** Space between cards; every cell carries half of it on each side. */
const GAP = 12;
const EDGE = space.page - GAP / 2;

function openNote(note: Note) {
  router.push({ pathname: '/note/[id]', params: { id: note.id } });
}

function newNote() {
  const note = useNotes.getState().create();
  if (note) router.push({ pathname: '/note/[id]', params: { id: note.id, fresh: '1' } });
}

const hasTag = (n: Note, tag: string) => extractTags(`${n.title}\n${n.body}`).includes(tag);
const asItem = (note: Note): Item => ({ kind: 'note', key: note.id, note });

export default function Notes() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const clearance = useTabBarClearance();
  const { width } = useWindowDimensions();
  const at = useClock((s) => s.at);
  const notes = useNotes((s) => s.notes);
  const [archived, setArchived] = useState(false);
  const [tag, setTag] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const tags = archived ? [] : noteTags(notes);
  // A filter for a tag that no longer exists would hide everything.
  if (tag && !archived && !tags.some((t) => t.tag === tag)) setTag(null);

  const shelf = visibleNotes(notes, { archived }).filter((n) => !isBlank(n));
  const tagged = tag && !archived ? shelf.filter((n) => hasTag(n, tag)) : shelf;
  const found = filterNotes(tagged, query);
  const pinnedCount = archived ? 0 : shelf.filter((n) => n.pinned).length;

  const pinned = found.filter((n) => n.pinned);
  const split = pinned.length > 0 && pinned.length < found.length;
  const items: Item[] = split
    ? [
        { kind: 'label', key: 'label:pinned', label: 'Pinned', first: true },
        ...pinned.map(asItem),
        { kind: 'label', key: 'label:others', label: 'Others', first: false },
        ...found.filter((n) => !n.pinned).map(asItem),
      ]
    : found.map(asItem);

  const sheetNote = sheetId ? notes.find((n) => n.id === sheetId) : undefined;
  const openSheet = (note: Note) => {
    haptic('heavy');
    setSheetId(note.id);
    setSheetOpen(true);
  };

  const toggleArchive = () => {
    haptic('select');
    setArchived(!archived);
    setTag(null);
    setQuery('');
  };

  const count = shelf.length;
  const kicker = archived
    ? `${count} archived`
    : [`${count} ${count === 1 ? 'note' : 'notes'}`, pinnedCount ? `${pinnedCount} pinned` : null].filter(Boolean).join(' · ');
  const searching = query.trim().length > 0;

  // An element rather than a component, so the search field keeps focus while the list changes.
  const header = (
    <View style={styles.headerWrap}>
      <PageHeader
        style={styles.header}
        label={kicker}
        title={archived ? 'Archive' : 'Notes'}
        right={
          <IconButton
            icon={archived ? 'notebook' : 'archive'}
            label={archived ? 'Back to notes' : 'Open archive'}
            tone={archived ? 'accent' : 'plain'}
            onPress={toggleArchive}
            testID="notes-archive"
          />
        }
      />
      {count || query ? (
        <View style={styles.tools}>
          <SearchField value={query} onChange={setQuery} placeholder={archived ? 'Search the archive' : 'Search notes'} />
          {tags.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={styles.tagScroll}
              contentContainerStyle={styles.tags}>
              <Chip label="All" size="sm" selected={tag === null} onPress={() => setTag(null)} />
              {tags.map((t) => (
                <Chip
                  key={t.tag}
                  label={`#${t.tag}`}
                  size="sm"
                  selected={tag === t.tag}
                  onPress={() => setTag(tag === t.tag ? null : t.tag)}
                  testID={`note-tag-${t.tag}`}
                />
              ))}
            </ScrollView>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const empty = searching ? (
    <EmptyState
      compact
      icon="magnifying-glass"
      title="No matches"
      body={`Nothing ${archived ? 'in the archive ' : ''}mentions “${query.trim()}”.`}
    />
  ) : archived ? (
    <EmptyState
      icon="archive"
      title="Nothing archived"
      body="Archived notes rest here, out of the way but never lost. Long-press a note to archive it."
    />
  ) : (
    <EmptyState
      icon="notebook"
      title="A fresh notebook"
      body="Meeting notes, lists and stray ideas. Checklists, #tags and links all work."
      action={{ label: 'New note', icon: 'plus', onPress: newNote }}
    />
  );

  return (
    <View style={[styles.flex, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      <FlashList
        data={items}
        masonry
        numColumns={width >= 700 ? 3 : 2}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.kind}
        overrideItemLayout={(layout, item, _index, maxColumns) => {
          if (item.kind === 'label') layout.span = maxColumns;
        }}
        renderItem={({ item }) =>
          item.kind === 'label' ? (
            <View style={[styles.labelCell, !item.first && styles.labelGap]}>
              <SectionLabel label={item.label} />
            </View>
          ) : (
            <View style={styles.cell}>
              <NoteCard note={item.note} now={at} onPress={openNote} onLongPress={openSheet} />
            </View>
          )
        }
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingHorizontal: EDGE, paddingBottom: clearance }}
        // Edited notes jump to the top; holding the old position would hide that.
        maintainVisibleContentPosition={{ disabled: true }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        testID="notes-list"
      />
      <NoteSheet note={sheetNote} visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

type SearchFieldProps = { value: string; onChange: (value: string) => void; placeholder: string };

function SearchField({ value, onChange, placeholder }: SearchFieldProps) {
  const c = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.search, { backgroundColor: c.surface, borderColor: focused ? c.accent : c.line }]}>
      <Icon name="magnifying-glass" size={18} color={focused ? c.accent : c.ink3} weight="bold" />
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={c.ink3}
        selectionColor={c.accent}
        cursorColor={c.accent}
        keyboardAppearance={c.scheme}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        maxLength={120}
        maxFontSizeMultiplier={1.4}
        accessibilityLabel={placeholder}
        testID="notes-search"
        style={[typo.body, styles.searchInput, { color: c.ink }, webInput]}
      />
      {value ? (
        <IconButton icon="x" label="Clear search" size={32} iconSize={16} onPress={() => onChange('')} testID="notes-search-clear" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerWrap: { marginHorizontal: -EDGE, paddingBottom: space.md },
  header: { paddingTop: 4 },
  tools: { paddingHorizontal: space.page, paddingTop: space.md, gap: space.md },
  tagScroll: { marginHorizontal: -space.page },
  tags: { gap: space.sm, paddingHorizontal: space.page },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 46,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  searchInput: { flex: 1, paddingVertical: 8 },
  cell: { padding: GAP / 2 },
  labelCell: { paddingHorizontal: GAP / 2, paddingTop: GAP / 2 },
  labelGap: { paddingTop: space.lg },
});
