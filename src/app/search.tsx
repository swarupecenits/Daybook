import { FlashList } from '@shopify/flash-list';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useDeferredValue, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, TextInput, type TextInputInstance, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { IconButton } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { webInput } from '@/components/form';
import { Highlight } from '@/components/highlight';
import { Icon } from '@/components/icon';
import { Hairline, LinkText, Screen, SectionLabel, useTopInset } from '@/components/layout';
import { Press } from '@/components/press';
import { T } from '@/components/text';
import { balances, standing } from '@/lib/balances';
import { category } from '@/lib/categories';
import { haptic } from '@/lib/haptics';
import { noteTags } from '@/lib/notes';
import { type HitKind, type SearchHit, search } from '@/lib/search';
import { goBack } from '@/lib/system';
import { firstName } from '@/lib/text';
import type { Expense, Note, Task } from '@/lib/types';
import { useClock } from '@/stores/clock';
import { useLedger } from '@/stores/ledger';
import { useLogs } from '@/stores/logs';
import { useNotes } from '@/stores/notes';
import { useTasks } from '@/stores/tasks';
import { forgetSearches, jumpToDay, rememberSearch, useUi } from '@/stores/ui';
import { radius, space, typo, useMoney, useTheme } from '@/theme';

const LIMIT = 60;
const MAX_QUERY = 120;

type Filter = HitKind | 'all';

const KINDS: readonly { kind: HitKind; label: string }[] = [
  { kind: 'note', label: 'Notes' },
  { kind: 'task', label: 'Tasks' },
  { kind: 'log', label: 'Day log' },
  { kind: 'person', label: 'Friends' },
  { kind: 'expense', label: 'Spending' },
];

const TAG: Record<HitKind, string> = { note: 'Note', task: 'Task', log: 'Log', person: 'Friend', expense: 'Spent' };

type Row = {
  hit: SearchHit;
  note?: Note;
  task?: Task;
  expense?: Expense;
  balance?: number;
};

function index<T extends { id: string }>(list: readonly T[]): ReadonlyMap<string, T> {
  return new Map(list.map((item) => [item.id, item]));
}

function openHit(hit: SearchHit, query: string) {
  rememberSearch(query);
  switch (hit.kind) {
    case 'note':
      router.push({ pathname: '/note/[id]', params: { id: hit.id } });
      return;
    case 'task':
      router.push({ pathname: '/task/[id]', params: { id: hit.id } });
      return;
    case 'person':
      router.push({ pathname: '/person/[id]', params: { id: hit.id } });
      return;
    case 'expense':
      router.push({ pathname: '/expense/[id]', params: { id: hit.id } });
      return;
    case 'log':
      if (hit.day) jumpToDay(hit.day);
      router.dismissTo('/');
  }
}

export default function SearchScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const top = useTopInset();
  const params = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(() => (typeof params.q === 'string' ? params.q.slice(0, MAX_QUERY) : ''));
  const [kind, setKind] = useState<Filter>('all');
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInputInstance>(null);
  const deferred = useDeferredValue(query);

  const today = useClock((s) => s.today);
  const notes = useNotes((s) => s.notes);
  const tasks = useTasks((s) => s.tasks);
  const logs = useLogs((s) => s.logs);
  const people = useLedger((s) => s.people);
  const entries = useLedger((s) => s.entries);
  const expenses = useLedger((s) => s.expenses);
  const recent = useUi((s) => s.recentSearches);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web') return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') goBack();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []),
  );

  const hits = search({ notes, tasks, logs, people, expenses }, deferred, today, LIMIT);
  const counts: Partial<Record<HitKind, number>> = {};
  for (const h of hits) counts[h.kind] = (counts[h.kind] ?? 0) + 1;
  // A filter with nothing left in it would show an empty page for no visible reason.
  if (kind !== 'all' && !counts[kind]) setKind('all');

  const noteIndex = index(notes);
  const taskIndex = index(tasks);
  const expenseIndex = index(expenses);
  const owed = balances(entries);
  const rows: Row[] = (kind === 'all' ? hits : hits.filter((h) => h.kind === kind)).map((hit) => ({
    hit,
    note: hit.kind === 'note' ? noteIndex.get(hit.id) : undefined,
    task: hit.kind === 'task' ? taskIndex.get(hit.id) : undefined,
    expense: hit.kind === 'expense' ? expenseIndex.get(hit.id) : undefined,
    balance: hit.kind === 'person' ? (owed.get(hit.id) ?? 0) : undefined,
  }));

  const searching = deferred.trim().length > 0;
  const stale = deferred !== query;
  const kinds = KINDS.filter((k) => counts[k.kind]);

  const fill = (text: string) => {
    haptic('select');
    setQuery(text.slice(0, MAX_QUERY));
    input.current?.focus();
  };

  const header = searching && hits.length ? (
    <View style={styles.listHead}>
      <T variant="label" color="ink3" style={styles.count}>
        {`${hits.length}${hits.length >= LIMIT ? '+' : ''} ${hits.length === 1 ? 'result' : 'results'}`}
      </T>
      {kinds.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.chipScroll}
          contentContainerStyle={styles.chips}>
          <Chip label="All" size="sm" selected={kind === 'all'} onPress={() => setKind('all')} testID="search-kind-all" />
          {kinds.map((k) => (
            <Chip
              key={k.kind}
              label={k.label}
              size="sm"
              count={counts[k.kind]}
              selected={kind === k.kind}
              onPress={() => setKind(kind === k.kind ? 'all' : k.kind)}
              testID={`search-kind-${k.kind}`}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  ) : null;

  const empty = searching ? (
    <EmptyState
      compact
      icon="magnifying-glass"
      title="No matches"
      body={`Nothing in your notes, tasks, log or money mentions “${deferred.trim()}”. Try fewer words.`}
    />
  ) : (
    <Idle notes={notes} recent={recent} onPick={fill} />
  );

  return (
    <Screen>
      <View style={[styles.bar, { paddingTop: top + 6 }]}>
        <IconButton icon="caret-left" label="Back" onPress={goBack} weight="bold" iconSize={20} testID="search-back" />
        <View style={[styles.field, { backgroundColor: c.surface, borderColor: focused ? c.accent : c.line }]}>
          <Icon name="magnifying-glass" size={18} color={focused ? c.accent : c.ink3} weight="bold" />
          <TextInput
            ref={input}
            value={query}
            onChangeText={setQuery}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={() => rememberSearch(query)}
            autoFocus
            placeholder="Search everything"
            placeholderTextColor={c.ink3}
            selectionColor={c.accent}
            cursorColor={c.accent}
            keyboardAppearance={c.scheme}
            returnKeyType="search"
            enterKeyHint="search"
            autoCorrect={false}
            autoCapitalize="none"
            maxLength={MAX_QUERY}
            maxFontSizeMultiplier={1.4}
            accessibilityLabel="Search everything"
            testID="search-input"
            style={[typo.body, styles.input, { color: c.ink }, webInput]}
          />
          {query ? (
            <IconButton icon="x" label="Clear search" size={32} iconSize={16} onPress={() => fill('')} testID="search-clear" />
          ) : null}
        </View>
      </View>
      <FlashList
        data={searching ? rows : []}
        keyExtractor={(row) => `${row.hit.kind}:${row.hit.id}`}
        getItemType={(row) => row.hit.kind}
        renderItem={({ item }) => <Result row={item} query={deferred} />}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
        style={stale && styles.stale}
        maintainVisibleContentPosition={{ disabled: true }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        testID="search-results"
      />
    </Screen>
  );
}

function Separator() {
  return <Hairline inset={space.page + 52} />;
}

function Result({ row, query }: { row: Row; query: string }) {
  const c = useTheme();
  const money = useMoney();
  const { hit, note, task, expense, balance } = row;
  const done = !!task?.doneAt;
  const meta = expense ? category(expense.category) : null;
  const tint = meta ? meta.color[c.scheme === 'dark' ? 1 : 0] : c.ink2;

  let detail = hit.detail;
  if (hit.kind === 'task' && task?.tag) detail = `${hit.detail} · #${task.tag}`;
  if (hit.kind === 'person') detail = standing(firstName(hit.title), balance ?? 0, (m) => money(m));
  if (meta) detail = `${meta.label} · ${hit.detail}`;

  let tile;
  if (hit.kind === 'person') {
    tile = <Avatar name={hit.title} size={38} />;
  } else if (meta) {
    tile = (
      <View style={[styles.tile, { backgroundColor: `${tint}24` }]}>
        <Icon name={meta.icon} size={18} color={tint} weight="bold" />
      </View>
    );
  } else if (hit.kind === 'note') {
    const paper = note?.color ?? 'plain';
    tile = (
      <View style={[styles.tile, styles.paper, { backgroundColor: c.paper[paper], borderColor: c.paperEdge[paper] }]}>
        <Icon name="notepad" size={18} color={c.ink2} weight="bold" />
      </View>
    );
  } else {
    tile = (
      <View style={[styles.tile, { backgroundColor: done ? c.positiveSoft : c.surface2 }]}>
        <Icon
          name={hit.kind === 'log' ? 'clock' : 'check-circle'}
          size={18}
          color={done ? c.positive : c.ink2}
          weight={done ? 'fill' : 'bold'}
        />
      </View>
    );
  }

  return (
    <Press
      onPress={() => openHit(hit, query)}
      scale={0.985}
      style={styles.row}
      accessibilityLabel={`${TAG[hit.kind]}: ${hit.title}. ${detail}`}
      accessibilityHint={hit.kind === 'log' ? 'Opens that day on Today' : undefined}
      testID={`hit-${hit.kind}-${hit.id}`}>
      {tile}
      <View style={styles.flex}>
        <Highlight
          text={hit.title}
          query={query}
          variant="bodyMedium"
          numberOfLines={hit.kind === 'log' ? 2 : 1}
          color={done ? 'ink3' : 'ink'}
          style={done && styles.struck}
        />
        {detail ? (
          hit.kind === 'note' ? (
            <Highlight text={detail} query={query} variant="small" color="ink3" numberOfLines={2} />
          ) : (
            <T variant="small" color="ink3" numberOfLines={1}>
              {detail}
            </T>
          )
        ) : null}
      </View>
      <View style={styles.end}>
        <T variant="label" color="ink3" style={styles.kind}>
          {TAG[hit.kind]}
        </T>
        {expense ? (
          <T variant="amount" color={expense.share ? 'ink' : 'ink3'}>
            {money(expense.share)}
          </T>
        ) : null}
      </View>
    </Press>
  );
}

type IdleProps = { notes: readonly Note[]; recent: readonly string[]; onPick: (text: string) => void };

function Idle({ notes, recent, onPick }: IdleProps) {
  const c = useTheme();
  const tags = noteTags(notes).slice(0, 14);
  return (
    <View style={styles.idle}>
      {recent.length ? (
        <View>
          <SectionLabel
            label="Recent"
            right={<LinkText label="Clear" color="ink3" onPress={forgetSearches} testID="search-recent-clear" />}
          />
          <View style={[styles.recent, { backgroundColor: c.surface, borderColor: c.line }]}>
            {recent.map((text, i) => (
              <View key={text}>
                {i > 0 ? <Hairline inset={48} /> : null}
                <Press
                  onPress={() => onPick(text)}
                  scale={0.985}
                  style={styles.recentRow}
                  accessibilityLabel={`Search for ${text}`}
                  testID={`search-recent-${i}`}>
                  <Icon name="clock-counter-clockwise" size={18} color={c.ink3} />
                  <T variant="body" numberOfLines={1} style={styles.flex}>
                    {text}
                  </T>
                  <Icon name="arrow-up-left" size={16} color={c.ink3} />
                </Press>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {tags.length ? (
        <View>
          <SectionLabel label="Tags" />
          <View style={styles.tagWrap}>
            {tags.map((t) => (
              <Chip key={t.tag} label={`#${t.tag}`} size="sm" count={t.count} onPress={() => onPick(`#${t.tag}`)} />
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.promise}>
        <View style={[styles.swipe, { backgroundColor: c.highlight }]} />
        <T variant="italic" color="ink2" align="center">
          One box for everything — notes, tasks, your day log, friends and spending.
        </T>
        <View style={styles.private}>
          <Icon name="shield-check" size={14} color={c.ink3} weight="bold" />
          <T variant="small" color="ink3">
            Searched on this phone. Nothing leaves it.
          </T>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 10, paddingRight: space.page, paddingBottom: space.sm },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 46,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  input: { flex: 1, paddingVertical: 8 },
  stale: { opacity: 0.6 },
  listHead: { paddingTop: space.sm, paddingBottom: space.xs },
  count: { paddingHorizontal: space.page, marginBottom: space.sm },
  chipScroll: { marginBottom: space.sm },
  chips: { gap: space.sm, paddingHorizontal: space.page },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: space.page, paddingVertical: 12, minHeight: 64 },
  tile: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  paper: { borderWidth: StyleSheet.hairlineWidth },
  struck: { textDecorationLine: 'line-through' },
  end: { alignItems: 'flex-end', gap: 2, alignSelf: 'flex-start', paddingTop: 2 },
  kind: { fontSize: 9, letterSpacing: 1 },
  idle: { paddingHorizontal: space.page, paddingTop: space.lg, gap: space.xl },
  recent: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 50 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  promise: { alignItems: 'center', gap: space.sm, paddingTop: space.xl, paddingHorizontal: space.lg },
  swipe: { width: 54, height: 10, borderRadius: 5, transform: [{ rotate: '-4deg' }], marginBottom: space.xs },
  private: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
