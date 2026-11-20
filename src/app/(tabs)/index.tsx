import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/button';
import { Meter } from '@/components/charts';
import { Field, webInput } from '@/components/form';
import { Icon } from '@/components/icon';
import { Card, Hairline, LinkText, SectionLabel } from '@/components/layout';
import { NoteCard } from '@/components/note-card';
import { Press } from '@/components/press';
import { Sheet } from '@/components/sheet';
import { useTabBarClearance } from '@/components/tab-bar';
import { listLayout, TaskList } from '@/components/task-list';
import { T } from '@/components/text';
import { balances, totals } from '@/lib/balances';
import {
  addDays,
  formatDay,
  formatDayLong,
  formatTime,
  greeting,
  MONTHS,
  monthOf,
  timeOf,
  toKey,
  toTimestamp,
  WEEKDAYS,
  WEEKDAYS_SHORT,
  weekDays,
  weekdayOf,
} from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { LIMITS } from '@/lib/limits';
import { isBlank, visibleNotes } from '@/lib/notes';
import { budgetStatus, inMonth, spent } from '@/lib/spending';
import { buildStandup, standupText } from '@/lib/standup';
import { shareText } from '@/lib/system';
import { compareTasks, doneBetween, isOpen, loadByDay, todayBuckets } from '@/lib/tasks';
import type { DayKey, LogItem, Note } from '@/lib/types';
import { deleteLog, moveTasks } from '@/stores/actions';
import { useClock } from '@/stores/clock';
import { useLedger } from '@/stores/ledger';
import { useLogs } from '@/stores/logs';
import { useNotes } from '@/stores/notes';
import { useSettings } from '@/stores/settings';
import { useTasks } from '@/stores/tasks';
import { useUi } from '@/stores/ui';
import { radius, space, typo, useMoney, useTheme } from '@/theme';

export default function Today() {
  const c = useTheme();
  const clearance = useTabBarClearance();
  const today = useClock((s) => s.today);
  const now = useClock((s) => s.now);
  const weekStart = useSettings((s) => s.weekStart);
  const tasks = useTasks((s) => s.tasks);
  const logs = useLogs((s) => s.logs);

  // The selected day follows the calendar across midnight unless another day was picked.
  const [selected, setSelected] = useState<DayKey>(today);
  const [seenToday, setSeenToday] = useState(today);
  if (seenToday !== today) {
    setSeenToday(today);
    if (selected === seenToday) setSelected(today);
  }
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<LogItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Search can ask for a particular day (a log result); each request is applied once.
  const jump = useUi((s) => s.jump);
  const [seenJump, setSeenJump] = useState(jump);
  if (jump !== seenJump) {
    setSeenJump(jump);
    if (jump) {
      setSelected(jump.day);
      setShowDone(false);
    }
  }
  const scroller = useRef<KeyboardAwareScrollViewRef>(null);
  useEffect(() => {
    if (seenJump) scroller.current?.scrollTo({ y: 0, animated: false });
  }, [seenJump]);

  const isToday = selected === today;
  const isFuture = selected > today;
  const days = weekDays(today, weekStart);
  const offWeek = !days.includes(selected);
  const load = loadByDay(tasks, days);
  const liveLogs = logs.filter((l) => l.deletedAt === null);
  const loggedDays = new Set(liveLogs.map((l) => l.day));
  const dayLogs = liveLogs.filter((l) => l.day === selected).sort((a, b) => a.createdAt - b.createdAt);

  const buckets = todayBuckets(tasks, today);
  const overdue = isToday ? buckets.overdue : [];
  const due = isToday ? buckets.today : tasks.filter((t) => isOpen(t) && t.dueDate === selected).sort(compareTasks);
  const done = doneBetween(tasks, toTimestamp(selected, null), toTimestamp(addDays(selected, 1), null));
  const doneOpen = showDone || !isToday;

  const share = () => {
    const text = standupText(selected, buildStandup({ day: selected, logs: liveLogs, tasks }));
    shareText(text, 'Standup');
  };

  const openLog = (log: LogItem) => {
    setEditing(log);
    setSheetOpen(true);
  };

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <KeyboardAwareScrollView
        ref={scroller}
        contentContainerStyle={{ paddingBottom: clearance }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bottomOffset={32}
        showsVerticalScrollIndicator={false}>
        <Header today={today} hour={Number(now.slice(0, 2))} />

        <WeekStrip
          days={days}
          today={today}
          selected={selected}
          load={load}
          logged={loggedDays}
          onSelect={(day) => {
            setSelected(day);
            setShowDone(false);
          }}
        />

        {offWeek ? (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={styles.offWeek}>
            <Press
              onPress={() => {
                setSelected(today);
                setShowDone(false);
              }}
              haptic="select"
              scale={0.97}
              accessibilityRole="button"
              accessibilityLabel={`Showing ${formatDayLong(selected)}. Back to today`}
              testID="back-to-today"
              style={[styles.offPill, { backgroundColor: c.ink }]}>
              <Icon name="calendar-dots" size={16} color={c.bg} weight="bold" />
              <T variant="calloutMedium" color={c.bg} numberOfLines={1} style={styles.shrink}>
                {formatDayLong(selected)}
              </T>
              <View style={[styles.offRule, { backgroundColor: c.bg }]} />
              <T variant="calloutMedium" color={c.bg}>
                Back to today
              </T>
              <Icon name="arrow-counter-clockwise" size={15} color={c.bg} weight="bold" />
            </Press>
          </Animated.View>
        ) : null}

        <View style={styles.body}>
          {overdue.length ? (
            <Animated.View layout={listLayout} entering={FadeIn} exiting={FadeOut}>
              <SectionLabel
                label={`Overdue · ${overdue.length}`}
                color="negative"
                right={
                  <LinkText
                    label="Move to today"
                    onPress={() =>
                      moveTasks(
                        overdue.map((t) => t.id),
                        today,
                      )
                    }
                    testID="overdue-move"
                  />
                }
              />
              <TaskList tasks={overdue} />
            </Animated.View>
          ) : null}

          {isToday || isFuture || due.length ? (
            <Animated.View layout={listLayout}>
              <SectionLabel
                label={isToday ? `Today · ${due.length}` : isFuture ? formatDay(selected, today) : 'Still open'}
                right={
                  isToday || isFuture ? (
                    <LinkText
                      label="Add task"
                      onPress={() => router.push({ pathname: '/capture', params: { intent: 'task', day: selected } })}
                      testID="today-add-task"
                    />
                  ) : null
                }
              />
              {due.length ? (
                <TaskList tasks={due} showDate={false} />
              ) : isToday || isFuture ? (
                <ClearDay future={isFuture} hasOverdue={overdue.length > 0} doneCount={done.length} />
              ) : null}
            </Animated.View>
          ) : null}

          {done.length ? (
            <Animated.View layout={listLayout} style={styles.doneBlock}>
              {isToday ? (
                <Press
                  onPress={() => setShowDone((v) => !v)}
                  haptic="select"
                  scale={0.98}
                  accessibilityRole="button"
                  aria-expanded={doneOpen}
                  testID="toggle-done"
                  style={styles.doneToggle}>
                  <Icon name="check-circle" size={18} color={c.positive} weight="fill" />
                  <T variant="calloutMedium" color="ink2" style={styles.flex}>
                    {done.length === 1 ? '1 done today' : `${done.length} done today`}
                  </T>
                  <Icon name={doneOpen ? 'caret-up' : 'caret-down'} size={16} color={c.ink3} weight="bold" />
                </Press>
              ) : (
                <SectionLabel label={`Done · ${done.length}`} color="positive" />
              )}
              {doneOpen ? <TaskList tasks={done} showDate={false} /> : null}
            </Animated.View>
          ) : null}

          {isFuture ? null : (
            <Animated.View layout={listLayout} style={styles.section}>
              <SectionLabel
                label={isToday ? 'Work log' : `Log · ${formatDay(selected, today)}`}
                right={
                  dayLogs.length || done.length ? (
                    <LinkText label="Share standup" onPress={share} testID="share-standup" />
                  ) : null
                }
              />
              <LogComposer day={selected} isToday={isToday} />
              <LogTimeline items={dayLogs} onPress={openLog} />
            </Animated.View>
          )}

          <Animated.View layout={listLayout} style={styles.section}>
            <MoneyPulse />
          </Animated.View>

          <Animated.View layout={listLayout}>
            <NotesShelf />
          </Animated.View>
        </View>
      </KeyboardAwareScrollView>

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Edit log" testID="log-sheet">
        {editing ? <LogEditor key={editing.id} log={editing} onDone={() => setSheetOpen(false)} /> : null}
      </Sheet>
    </View>
  );
}

function Header({ today, hour }: { today: DayKey; hour: number }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const name = useSettings((s) => s.name);
  const [y, m, d] = today.split('-').map(Number);
  const hello = greeting(hour);
  return (
    <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
      <View style={styles.kicker}>
        <T variant="label" color="ink3" numberOfLines={1} style={styles.flex}>
          {name ? `${hello}, ${name}` : hello}
        </T>
        <View style={styles.actions}>
          <IconButton icon="magnifying-glass" label="Search" onPress={() => router.push('/search')} testID="open-search" />
          <IconButton icon="gear-six" label="Settings" onPress={() => router.push('/settings')} testID="open-settings" />
        </View>
      </View>
      <View style={styles.titleWrap}>
        <View style={[styles.marker, { backgroundColor: c.highlight }]} />
        <T variant="hero" accessibilityRole="header">
          {WEEKDAYS[weekdayOf(today)]}
        </T>
      </View>
      <T variant="italic" color="ink2">
        {`${d} ${MONTHS[m - 1]} ${y}`}
      </T>
    </View>
  );
}

type WeekStripProps = {
  days: readonly DayKey[];
  today: DayKey;
  selected: DayKey;
  load: ReadonlyMap<DayKey, number>;
  logged: ReadonlySet<DayKey>;
  onSelect: (day: DayKey) => void;
};

function WeekStrip({ days, today, selected, load, logged, onSelect }: WeekStripProps) {
  const c = useTheme();
  return (
    <View style={styles.week} accessibilityRole="tablist">
      {days.map((day) => {
        const on = day === selected;
        const past = day < today;
        const count = Math.min(3, load.get(day) ?? 0);
        const dot = on ? c.bg : past ? c.negative : c.accent;
        return (
          <Press
            key={day}
            onPress={() => {
              if (!on) onSelect(day);
            }}
            haptic={on ? false : 'select'}
            scale={0.92}
            accessibilityRole="tab"
            aria-selected={on}
            accessibilityLabel={`${formatDay(day, today)}${count ? `, ${load.get(day)} open tasks` : ''}`}
            testID={`week-${day}`}
            style={[styles.day, on ? { backgroundColor: c.ink } : null]}>
            <T variant="label" color={on ? c.bg : 'ink3'} style={styles.dayName}>
              {WEEKDAYS_SHORT[weekdayOf(day)]}
            </T>
            <T variant="headline" color={on ? c.bg : past ? 'ink2' : 'ink'} style={styles.dayNum}>
              {Number(day.slice(8, 10))}
            </T>
            <View style={styles.dots}>
              {count > 0
                ? Array.from({ length: count }, (_, i) => <View key={i} style={[styles.dot, { backgroundColor: dot }]} />)
                : logged.has(day)
                  ? <View style={[styles.dash, { backgroundColor: on ? c.bg : c.ink3 }]} />
                  : null}
            </View>
            {day === today && !on ? <View style={[styles.todayMark, { backgroundColor: c.accent }]} /> : null}
          </Press>
        );
      })}
    </View>
  );
}

function ClearDay({ future, hasOverdue, doneCount }: { future: boolean; hasOverdue: boolean; doneCount: number }) {
  const c = useTheme();
  const title = future ? 'Nothing planned yet' : doneCount ? 'All caught up' : hasOverdue ? 'Nothing else due today' : 'A clear day';
  const body = future
    ? 'Tap “Add task”, or type “tomorrow” in quick add.'
    : doneCount
      ? 'Everything due today is done. Nice work.'
      : 'Add what matters, or jot down what you’re working on below.';
  return (
    <View style={[styles.clear, { borderColor: c.lineStrong }]}>
      <Icon name={doneCount && !future ? 'seal-check' : 'sun-horizon'} size={26} color={doneCount && !future ? c.positive : c.ink2} weight="duotone" />
      <View style={styles.flex}>
        <T variant="headline">{title}</T>
        <T variant="small" color="ink3">
          {body}
        </T>
      </View>
    </View>
  );
}

function LogComposer({ day, isToday }: { day: DayKey; isToday: boolean }) {
  const c = useTheme();
  const [text, setText] = useState('');
  const ready = text.trim().length > 0;
  const submit = () => {
    if (!ready) return;
    if (useLogs.getState().add(text, day)) {
      haptic('soft');
      setText('');
    }
  };
  return (
    <View style={[styles.composer, { backgroundColor: c.surface, borderColor: c.line }]}>
      <Icon name="pencil-simple" size={18} color={c.ink3} />
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        submitBehavior="submit"
        returnKeyType="done"
        placeholder={isToday ? 'What are you working on?' : 'Add to this day’s log'}
        placeholderTextColor={c.ink3}
        selectionColor={c.accent}
        cursorColor={c.accent}
        keyboardAppearance={c.scheme}
        maxLength={LIMITS.log}
        maxFontSizeMultiplier={1.4}
        accessibilityLabel="New log entry"
        testID="log-input"
        style={[typo.body, styles.composerInput, { color: c.ink }, webInput]}
      />
      <IconButton
        icon="arrow-up"
        label="Add to log"
        onPress={submit}
        disabled={!ready}
        tone={ready ? 'ink' : 'surface'}
        color={ready ? undefined : c.ink3}
        size={34}
        weight="bold"
        haptic={false}
        testID="log-add"
      />
    </View>
  );
}

function LogTimeline({ items, onPress }: { items: readonly LogItem[]; onPress: (log: LogItem) => void }) {
  const c = useTheme();
  if (!items.length) return null;
  return (
    <View style={styles.timeline}>
      {items.map((log, i) => {
        const created = new Date(log.createdAt);
        const stamp = toKey(created) === log.day ? formatTime(timeOf(created)) : '';
        const last = i === items.length - 1;
        return (
          <Animated.View key={log.id} entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)} layout={listLayout}>
            <Press
              onPress={() => onPress(log)}
              onLongPress={() => deleteLog(log.id)}
              scale={0.99}
              accessibilityLabel={`${stamp ? `${stamp}, ` : ''}${log.text}`}
              accessibilityHint="Opens to edit. Long press to delete."
              testID={`log-${log.id}`}
              style={styles.logRow}>
              <T variant="label" color="ink3" style={styles.logTime} numberOfLines={1}>
                {stamp}
              </T>
              <View style={styles.rail}>
                <View style={[styles.railDot, { borderColor: c.accent, backgroundColor: c.bg }]} />
                {last ? null : <View style={[styles.railLine, { backgroundColor: c.line }]} />}
              </View>
              <T variant="body" style={[styles.flex, styles.logText]}>
                {log.text}
              </T>
            </Press>
          </Animated.View>
        );
      })}
    </View>
  );
}

function LogEditor({ log, onDone }: { log: LogItem; onDone: () => void }) {
  const [text, setText] = useState(log.text);
  return (
    <View style={styles.editor}>
      <Field
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        maxLength={LIMITS.log}
        accessibilityLabel="Log entry"
        testID="log-edit-input"
      />
      <View style={styles.editorActions}>
        <Button
          label="Delete"
          icon="trash"
          variant="danger"
          size="sm"
          onPress={() => {
            onDone();
            deleteLog(log.id);
          }}
        />
        <View style={styles.flex} />
        <Button
          label="Save"
          variant="ink"
          size="sm"
          disabled={!text.trim()}
          onPress={() => {
            useLogs.getState().update(log.id, text);
            onDone();
          }}
          testID="log-save"
        />
      </View>
    </View>
  );
}

function MoneyPulse() {
  const c = useTheme();
  const money = useMoney();
  const today = useClock((s) => s.today);
  const budget = useSettings((s) => s.budget);
  const people = useLedger((s) => s.people);
  const entries = useLedger((s) => s.entries);
  const expenses = useLedger((s) => s.expenses);

  const month = monthOf(today);
  const sum = totals(balances(entries), people);
  const monthSpent = spent(inMonth(expenses, month));
  const status = budgetStatus(monthSpent, budget, month, today);
  const hasFriends = people.some((p) => p.deletedAt === null);
  const hasSpending = expenses.some((e) => e.deletedAt === null);

  const open = (view: 'friends' | 'spending') => {
    useUi.setState({ moneyView: view });
    router.navigate('/money');
  };

  if (!hasFriends && !hasSpending && budget === 0) {
    return (
      <Card>
        <View style={styles.pulseHead}>
          <Icon name="wallet" size={22} color={c.ink} weight="duotone" />
          <T variant="headline" style={styles.flex}>
            Money, minus the awkwardness
          </T>
        </View>
        <T variant="callout" color="ink2" style={styles.pulseBody}>
          Keep track of who owes whom, split bills, and see where the month went.
        </T>
        <View style={styles.pulseActions}>
          <Button
            label="Lent or borrowed"
            icon="handshake"
            variant="secondary"
            size="sm"
            onPress={() => router.push({ pathname: '/capture', params: { intent: 'money' } })}
          />
          <Button
            label="Expense"
            icon="receipt"
            variant="secondary"
            size="sm"
            onPress={() => router.push({ pathname: '/capture', params: { intent: 'expense' } })}
          />
        </View>
      </Card>
    );
  }

  return (
    <Card padded={false}>
      <Press onPress={() => open('friends')} scale={0.99} style={styles.pulseRow} accessibilityLabel="Open friends" testID="pulse-friends">
        <View style={styles.flex}>
          <T variant="small" color="ink3">
            Friends owe you
          </T>
          <T variant="amountLarge" color={sum.owedToMe ? 'positive' : 'ink3'}>
            {money(sum.owedToMe)}
          </T>
        </View>
        <View style={[styles.flex, styles.alignEnd]}>
          <T variant="small" color="ink3">
            You owe
          </T>
          <T variant="amountLarge" color={sum.iOwe ? 'negative' : 'ink3'}>
            {money(sum.iOwe)}
          </T>
        </View>
      </Press>
      <Hairline inset={space.lg} />
      <Press onPress={() => open('spending')} scale={0.99} style={styles.pulseSpend} accessibilityLabel="Open spending" testID="pulse-spending">
        <View style={styles.spendHead}>
          <T variant="small" color="ink3" style={styles.flex}>
            {`Spent in ${MONTHS[Number(month.slice(5, 7)) - 1]}`}
          </T>
          <T variant="amount">
            {money(monthSpent)}
            {budget > 0 ? (
              <T variant="small" color="ink3">
                {`  of ${money(budget, { compact: true })}`}
              </T>
            ) : null}
          </T>
        </View>
        {budget > 0 ? (
          <>
            <Meter value={status.ratio} color={status.ratio > 0.85 ? c.warning : c.accent} over={c.negative} />
            <T variant="small" color={status.remaining < 0 ? 'negative' : 'ink3'}>
              {status.remaining < 0
                ? `${money(-status.remaining)} over budget`
                : `${money(status.remaining)} left${status.perDay > 0 ? ` · about ${money(status.perDay, { compact: true })} a day` : ''}`}
            </T>
          </>
        ) : null}
      </Press>
    </Card>
  );
}

const SHELF_CARD = 176;

function NotesShelf() {
  const notes = useNotes((s) => s.notes);
  const at = useClock((s) => s.at);
  const live = visibleNotes(notes).filter((n) => !isBlank(n));
  const pinned = live.filter((n) => n.pinned);
  const shelf = (pinned.length ? pinned : live).slice(0, 8);
  if (!shelf.length) return null;
  const open = (note: Note) => router.push({ pathname: '/note/[id]', params: { id: note.id } });
  return (
    <View style={styles.section}>
      <SectionLabel
        label={pinned.length ? 'Pinned notes' : 'Recent notes'}
        right={<LinkText label="All notes" onPress={() => router.navigate('/notes')} />}
        style={styles.shelfLabel}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={SHELF_CARD + space.md}
        style={styles.shelfScroll}
        contentContainerStyle={styles.shelf}>
        {shelf.map((n) => (
          <NoteCard key={n.id} note={n} now={at} onPress={open} width={SHELF_CARD} lines={4} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  alignEnd: { alignItems: 'flex-end' },
  header: { paddingHorizontal: space.page },
  kicker: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2, marginRight: -8 },
  titleWrap: { alignSelf: 'flex-start', marginTop: 2 },
  marker: {
    position: 'absolute',
    left: -6,
    right: -8,
    bottom: 7,
    height: 17,
    borderRadius: 4,
    transform: [{ rotate: '-1.5deg' }],
  },
  week: { flexDirection: 'row', paddingHorizontal: space.page - 6, marginTop: space.xl, gap: 2 },
  offWeek: { paddingHorizontal: space.page, marginTop: space.md, alignItems: 'flex-start' },
  offPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    maxWidth: '100%',
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
  },
  offRule: { width: 1, height: 14, opacity: 0.35 },
  shrink: { flexShrink: 1 },
  day: { flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 6, borderRadius: radius.md, gap: 2 },
  dayName: { fontSize: 10, letterSpacing: 0.8 },
  dayNum: { fontVariant: ['tabular-nums'] },
  dots: { flexDirection: 'row', gap: 3, height: 6, alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  dash: { width: 10, height: 2, borderRadius: 1 },
  todayMark: { position: 'absolute', bottom: -4, width: 16, height: 3, borderRadius: 1.5 },
  body: { paddingHorizontal: space.page, paddingTop: space.xl, gap: space.xl },
  section: { gap: 0 },
  doneBlock: { gap: space.sm },
  doneToggle: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 40 },
  clear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 50,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  composerInput: { flex: 1, paddingVertical: 10 },
  timeline: { marginTop: space.md },
  logRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10, minHeight: 44 },
  logTime: { width: 62, textAlign: 'right', paddingTop: 5 },
  rail: { width: 12, alignItems: 'center' },
  railDot: { width: 11, height: 11, borderRadius: 6, borderWidth: 2.5, marginTop: 6 },
  railLine: { flex: 1, width: 1.5, marginTop: 3, marginBottom: -3 },
  logText: { paddingBottom: space.md },
  editor: { gap: space.lg },
  editorActions: { flexDirection: 'row', alignItems: 'center' },
  pulseHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pulseBody: { marginTop: 6 },
  pulseActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  pulseRow: { flexDirection: 'row', padding: space.lg, gap: space.md },
  pulseSpend: { padding: space.lg, gap: space.sm },
  spendHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  shelfLabel: { marginBottom: space.sm },
  shelfScroll: { marginHorizontal: -space.page },
  shelf: { gap: space.md, paddingHorizontal: space.page },
});
