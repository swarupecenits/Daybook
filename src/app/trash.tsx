import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Button, IconButton } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { Hairline, LinkText, Screen, TopBar } from '@/components/layout';
import { Press } from '@/components/press';
import { Sheet } from '@/components/sheet';
import { listLayout } from '@/components/task-list';
import { T } from '@/components/text';
import { category } from '@/lib/categories';
import { formatDay, formatDayShort, relativeTime } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { confirm } from '@/lib/system';
import { TRASH_DAYS, type TrashItem, type TrashKind, trashItems } from '@/lib/trash';
import { useClock } from '@/stores/clock';
import { useLedger } from '@/stores/ledger';
import { useLogs } from '@/stores/logs';
import { useNotes } from '@/stores/notes';
import { useTasks } from '@/stores/tasks';
import { toast } from '@/stores/toast';
import { destroyItem, emptyTrash, restoreItem } from '@/stores/trash';
import { jumpToDay } from '@/stores/ui';
import { radius, space, useMoney, useTheme } from '@/theme';

type Filter = TrashKind | 'all';

const KINDS: readonly { kind: TrashKind; label: string }[] = [
  { kind: 'note', label: 'Notes' },
  { kind: 'task', label: 'Tasks' },
  { kind: 'log', label: 'Day log' },
  { kind: 'person', label: 'Friends' },
  { kind: 'entry', label: 'Ledger' },
  { kind: 'expense', label: 'Spending' },
];

const NOUN: Record<TrashKind, string> = {
  note: 'Note',
  task: 'Task',
  log: 'Log entry',
  person: 'Friend',
  entry: 'Ledger entry',
  expense: 'Expense',
};

function leftLabel(days: number): string {
  if (days === 0) return 'goes on next launch';
  return days === 1 ? '1 day left' : `${days} days left`;
}

/** Opens what was just restored. */
function reopen(item: TrashItem) {
  switch (item.kind) {
    case 'note':
      router.push({ pathname: '/note/[id]', params: { id: item.id } });
      return;
    case 'task':
      router.push({ pathname: '/task/[id]', params: { id: item.id } });
      return;
    case 'person':
      router.push({ pathname: '/person/[id]', params: { id: item.id } });
      return;
    case 'entry':
      router.push({ pathname: '/person/[id]', params: { id: item.personId } });
      return;
    case 'expense':
      router.push({ pathname: '/expense/[id]', params: { id: item.id } });
      return;
    case 'log':
      jumpToDay(item.day);
      router.dismissTo('/');
  }
}

function restore(item: TrashItem): boolean {
  if (!restoreItem(item)) {
    toast({ message: "Couldn't restore that.", tone: 'danger', icon: 'warning' });
    return false;
  }
  haptic('success');
  toast({
    message: `${NOUN[item.kind]} restored`,
    tone: 'success',
    icon: 'arrow-counter-clockwise',
    action: { label: 'Open', onPress: () => reopen(item) },
  });
  return true;
}

async function destroy(item: TrashItem): Promise<boolean> {
  const sure = await confirm({
    title: 'Delete for good?',
    message:
      item.kind === 'person'
        ? `${item.title} and their ledger will be gone from this phone. This can’t be undone.`
        : 'It will be gone from this phone. This can’t be undone.',
    confirm: 'Delete forever',
    destructive: true,
  });
  if (!sure) return false;
  if (!destroyItem(item)) {
    toast({ message: "Couldn't delete that.", tone: 'danger', icon: 'warning' });
    return false;
  }
  haptic('heavy');
  toast({ message: `${NOUN[item.kind]} deleted for good`, icon: 'trash' });
  return true;
}

export default function TrashScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const at = useClock((s) => s.at);
  const notes = useNotes((s) => s.notes);
  const tasks = useTasks((s) => s.tasks);
  const logs = useLogs((s) => s.logs);
  const people = useLedger((s) => s.people);
  const entries = useLedger((s) => s.entries);
  const expenses = useLedger((s) => s.expenses);
  const [kind, setKind] = useState<Filter>('all');
  const [picked, setPicked] = useState<TrashItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const items = trashItems({ notes, tasks, logs, people, entries, expenses }, at);
  const counts: Partial<Record<TrashKind, number>> = {};
  for (const item of items) counts[item.kind] = (counts[item.kind] ?? 0) + 1;
  if (kind !== 'all' && !counts[kind]) setKind('all');
  const shown = kind === 'all' ? items : items.filter((item) => item.kind === kind);
  const kinds = KINDS.filter((k) => counts[k.kind]);

  const open = (item: TrashItem) => {
    haptic('tap');
    setPicked(item);
    setSheetOpen(true);
  };

  const emptyAll = async () => {
    const n = items.length;
    const sure = await confirm({
      title: 'Empty the trash?',
      message: `${n === 1 ? 'This item' : `All ${n} items`} will be deleted from this phone for good. This can’t be undone.`,
      confirm: 'Empty trash',
      destructive: true,
    });
    if (!sure) return;
    const done = emptyTrash();
    if (done === null) return;
    haptic('heavy');
    toast({ message: 'Trash emptied', icon: 'trash' });
  };

  return (
    <Screen>
      <TopBar
        title="Trash"
        right={
          items.length ? <LinkText label="Empty" color="negative" onPress={() => void emptyAll()} testID="trash-empty" /> : null
        }
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.xxl * 2 }]}
        showsVerticalScrollIndicator={false}
        testID="trash-list">
        <View style={styles.intro}>
          <Icon name="clock-counter-clockwise" size={16} color={c.ink3} weight="bold" />
          <T variant="small" color="ink3" style={styles.flex}>
            {`Deleted things rest here for ${TRASH_DAYS} days, then go for good. Restore puts them back where they were.`}
          </T>
        </View>

        {kinds.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chips}>
            <Chip label="All" size="sm" count={items.length} selected={kind === 'all'} onPress={() => setKind('all')} />
            {kinds.map((k) => (
              <Chip
                key={k.kind}
                label={k.label}
                size="sm"
                count={counts[k.kind]}
                selected={kind === k.kind}
                onPress={() => setKind(kind === k.kind ? 'all' : k.kind)}
                testID={`trash-kind-${k.kind}`}
              />
            ))}
          </ScrollView>
        ) : null}

        {shown.length ? (
          <Animated.View layout={listLayout} style={[styles.list, { backgroundColor: c.surface, borderColor: c.line }]}>
            {shown.map((item, i) => (
              <Animated.View
                key={`${item.kind}:${item.id}`}
                layout={listLayout}
                entering={FadeIn.duration(180)}
                exiting={FadeOut.duration(140)}>
                {i > 0 ? <Hairline inset={space.lg + 52} /> : null}
                <TrashRow item={item} at={at} onOpen={open} />
              </Animated.View>
            ))}
          </Animated.View>
        ) : (
          <EmptyState
            icon="trash"
            title="Trash is empty"
            body="Notes, tasks, friends and bills you delete wait here for a month, in case you change your mind."
          />
        )}
      </ScrollView>

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title={picked ? NOUN[picked.kind] : undefined} testID="trash-sheet">
        {picked ? (
          <TrashDetail
            item={picked}
            at={at}
            onRestore={() => {
              if (restore(picked)) setSheetOpen(false);
            }}
            onDestroy={() =>
              void destroy(picked).then((gone) => {
                if (gone) setSheetOpen(false);
              })
            }
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}

function Tile({ item }: { item: TrashItem }) {
  const c = useTheme();
  if (item.kind === 'person' || item.kind === 'entry') return <Avatar name={item.title} size={38} />;
  if (item.kind === 'expense') {
    const meta = category(item.category);
    const tint = meta.color[c.scheme === 'dark' ? 1 : 0];
    return (
      <View style={[styles.tile, { backgroundColor: `${tint}24` }]}>
        <Icon name={meta.icon} size={18} color={tint} weight="bold" />
      </View>
    );
  }
  if (item.kind === 'note') {
    return (
      <View style={[styles.tile, styles.paper, { backgroundColor: c.paper[item.color], borderColor: c.paperEdge[item.color] }]}>
        <Icon name="notepad" size={18} color={c.ink2} weight="bold" />
      </View>
    );
  }
  return (
    <View style={[styles.tile, { backgroundColor: c.surface2 }]}>
      <Icon name={item.kind === 'log' ? 'clock' : 'check-circle'} size={18} color={c.ink2} weight="bold" />
    </View>
  );
}

/** One line on what the item is, in the same words the rest of the app uses. */
function useSummary(item: TrashItem): string {
  const money = useMoney();
  const today = useClock((s) => s.today);
  switch (item.kind) {
    case 'note':
      return item.preview || 'Empty note';
    case 'task':
      return item.done ? 'Done' : item.dueDate ? `Due ${formatDay(item.dueDate, today)}` : 'Anytime';
    case 'log':
      return formatDay(item.day, today);
    case 'person': {
      const rows = item.entries === 1 ? '1 ledger entry' : `${item.entries} ledger entries`;
      if (!item.entries) return 'No ledger entries';
      if (!item.balance) return `${rows} · settled`;
      return `${rows} · ${item.balance > 0 ? 'owed you' : 'you owed'} ${money(Math.abs(item.balance))}`;
    }
    case 'entry': {
      const what = item.amount > 0 ? `You gave ${money(item.amount)}` : `You got ${money(-item.amount)}`;
      return [what, formatDayShort(item.date, today), item.note].filter(Boolean).join(' · ');
    }
    case 'expense': {
      const split = item.friends ? ` · split with ${item.friends}` : '';
      return `${money(item.share)} · ${category(item.category).label}${split}`;
    }
  }
}

function TrashRow({ item, at, onOpen }: { item: TrashItem; at: number; onOpen: (item: TrashItem) => void }) {
  const summary = useSummary(item);
  return (
    <Press
      onPress={() => onOpen(item)}
      scale={0.985}
      style={styles.row}
      accessibilityLabel={`${NOUN[item.kind]}: ${item.title}. ${summary}. ${leftLabel(item.daysLeft)}.`}
      accessibilityHint="Shows restore and delete options"
      testID={`trash-${item.kind}-${item.id}`}>
      <Tile item={item} />
      <View style={styles.flex}>
        <T variant="bodyMedium" numberOfLines={1}>
          {item.title}
        </T>
        <T variant="small" color="ink3" numberOfLines={1}>
          {summary}
        </T>
        <T variant="label" color={item.daysLeft <= 3 ? 'warning' : 'ink3'} style={styles.left}>
          {`Deleted ${relativeTime(item.deletedAt, at)} · ${leftLabel(item.daysLeft)}`}
        </T>
      </View>
      <IconButton
        icon="arrow-counter-clockwise"
        label={`Restore ${item.title}`}
        tone="surface"
        size={36}
        iconSize={17}
        weight="bold"
        onPress={() => restore(item)}
        testID={`trash-restore-${item.id}`}
      />
    </Press>
  );
}

type DetailProps = { item: TrashItem; at: number; onRestore: () => void; onDestroy: () => void };

function TrashDetail({ item, at, onRestore, onDestroy }: DetailProps) {
  const c = useTheme();
  const summary = useSummary(item);
  const linked =
    item.kind === 'person' && item.entries
      ? 'Their ledger comes back with them.'
      : item.kind === 'expense' && item.friends
        ? 'Restoring also brings back what friends owe for it.'
        : null;
  return (
    <View style={styles.detail}>
      <View style={styles.detailHead}>
        <Tile item={item} />
        <View style={styles.flex}>
          <T variant="heading" numberOfLines={3}>
            {item.title}
          </T>
          <T variant="callout" color="ink2" numberOfLines={item.kind === 'note' ? 5 : 2}>
            {summary}
          </T>
        </View>
      </View>
      <View style={[styles.stamp, { backgroundColor: item.daysLeft <= 3 ? c.warningSoft : c.surface2 }]}>
        <Icon name="clock" size={14} color={item.daysLeft <= 3 ? c.warning : c.ink2} weight="bold" />
        <T variant="small" color={item.daysLeft <= 3 ? 'warning' : 'ink2'} style={styles.flex}>
          {`Deleted ${relativeTime(item.deletedAt, at)} · ${leftLabel(item.daysLeft)}`}
        </T>
      </View>
      {linked ? (
        <T variant="small" color="ink3">
          {linked}
        </T>
      ) : null}
      <Animated.View entering={FadeIn.duration(160)} style={styles.actions}>
        <Button label="Restore" icon="arrow-counter-clockwise" variant="ink" full onPress={onRestore} testID="trash-sheet-restore" />
        <Button label="Delete forever" icon="trash" variant="danger" full onPress={onDestroy} testID="trash-sheet-destroy" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: space.page, paddingTop: space.sm, gap: space.lg },
  intro: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingHorizontal: 4 },
  chipScroll: { marginHorizontal: -space.page },
  chips: { gap: space.sm, paddingHorizontal: space.page },
  list: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: space.lg, paddingRight: space.md, paddingVertical: 12, minHeight: 72 },
  tile: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  paper: { borderWidth: StyleSheet.hairlineWidth },
  left: { fontSize: 9, letterSpacing: 0.8, marginTop: 3 },
  detail: { gap: space.lg, paddingTop: space.xs },
  detailHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  stamp: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: 10, borderRadius: radius.md },
  actions: { gap: space.sm, marginTop: space.xs },
});
