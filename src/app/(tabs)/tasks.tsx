import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/button';
import { Chip, Segmented } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { webInput } from '@/components/form';
import { Icon } from '@/components/icon';
import { LinkText, PageHeader, SectionLabel } from '@/components/layout';
import { useTabBarClearance } from '@/components/tab-bar';
import { listLayout, TaskList } from '@/components/task-list';
import { T } from '@/components/text';
import { addDays, formatDay, weekdayOf, WEEKDAYS } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { LIMITS } from '@/lib/limits';
import { type ChipKind, parseTask } from '@/lib/parse-task';
import { anytimeTasks, doneTasks, taskCounts, taskTags, todayBuckets, upcomingGroups } from '@/lib/tasks';
import type { DayKey, Task } from '@/lib/types';
import { moveTasks } from '@/stores/actions';
import { useClock } from '@/stores/clock';
import { useSettings } from '@/stores/settings';
import { useTasks } from '@/stores/tasks';
import { radius, space, typo, useTheme } from '@/theme';

type TaskView = 'today' | 'upcoming' | 'anytime' | 'done';

const DONE_PAGE = 30;

export default function Tasks() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const clearance = useTabBarClearance();
  const today = useClock((s) => s.today);
  const tasks = useTasks((s) => s.tasks);
  const [view, setView] = useState<TaskView>('today');
  const [tag, setTag] = useState<string | null>(null);
  const [doneLimit, setDoneLimit] = useState(DONE_PAGE);

  const tags = taskTags(tasks);
  // A filter for a tag that no longer exists would hide everything.
  if (tag && !tags.includes(tag)) setTag(null);
  const pool = tag ? tasks.filter((t) => t.tag === tag) : tasks;

  const counts = taskCounts(pool, today);
  const open = counts.overdue + counts.today + counts.upcoming + counts.anytime;
  const kicker = [`${open} open`, counts.overdue ? `${counts.overdue} overdue` : null].filter(Boolean).join(' · ');

  return (
    // The scroller starts below the status bar so the sticky switcher never slides under it.
    <View style={[styles.flex, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: clearance }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}>
        <PageHeader
          style={styles.header}
          label={kicker}
          title="Tasks"
          right={<IconButton icon="magnifying-glass" label="Search" onPress={() => router.push('/search')} />}
        />
        <Sticky>
          <Segmented
            value={view}
            onChange={(v) => {
              setView(v);
              setDoneLimit(DONE_PAGE);
            }}
            options={[
              { value: 'today', label: 'Today', count: counts.overdue + counts.today },
              { value: 'upcoming', label: 'Upcoming', count: counts.upcoming },
              { value: 'anytime', label: 'Anytime', count: counts.anytime },
              { value: 'done', label: 'Done' },
            ]}
            testID="task-view"
          />
        </Sticky>

        <View style={styles.body}>
          {view !== 'done' ? (
            <QuickAdd
              fallbackDay={view === 'today' ? today : view === 'upcoming' ? addDays(today, 1) : null}
              tag={tag}
            />
          ) : null}

          {tags.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagScroll} contentContainerStyle={styles.tags}>
              <Chip label="All" size="sm" selected={tag === null} onPress={() => setTag(null)} />
              {tags.map((t) => (
                <Chip
                  key={t}
                  label={`#${t}`}
                  size="sm"
                  selected={tag === t}
                  onPress={() => setTag(tag === t ? null : t)}
                  testID={`tag-${t}`}
                />
              ))}
            </ScrollView>
          ) : null}

          {view === 'today' ? <TodayView tasks={pool} today={today} /> : null}
          {view === 'upcoming' ? <UpcomingView tasks={pool} today={today} /> : null}
          {view === 'anytime' ? <AnytimeView tasks={pool} /> : null}
          {view === 'done' ? (
            <DoneView tasks={pool} limit={doneLimit} onMore={() => setDoneLimit((n) => n + DONE_PAGE)} />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function Sticky({ children }: { children: ReactNode }) {
  const c = useTheme();
  return <View style={[styles.sticky, { backgroundColor: c.bg }]}>{children}</View>;
}

function TodayView({ tasks, today }: { tasks: readonly Task[]; today: DayKey }) {
  const { overdue, today: due } = todayBuckets(tasks, today);
  if (!overdue.length && !due.length) {
    return (
      <EmptyState
        icon="sun-horizon"
        title="Nothing due today"
        body="Add one above. Try “send report fri 5pm !!” or “water plants every sunday”."
      />
    );
  }
  return (
    <>
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
              />
            }
          />
          <TaskList tasks={overdue} />
        </Animated.View>
      ) : null}
      {due.length ? (
        <Animated.View layout={listLayout}>
          <SectionLabel label={`${WEEKDAYS[weekdayOf(today)]} · ${due.length}`} />
          <TaskList tasks={due} showDate={false} />
        </Animated.View>
      ) : null}
    </>
  );
}

function UpcomingView({ tasks, today }: { tasks: readonly Task[]; today: DayKey }) {
  const groups = upcomingGroups(tasks, today);
  if (!groups.length) {
    return (
      <EmptyState
        icon="calendar-dots"
        title="Nothing on the horizon"
        body="Tasks with a future date gather here, day by day."
      />
    );
  }
  return (
    <>
      {groups.map((g) => (
        <Animated.View key={g.day} layout={listLayout} entering={FadeIn} exiting={FadeOut}>
          <SectionLabel label={formatDay(g.day, today)} right={<T variant="small" color="ink3">{g.items.length}</T>} />
          <TaskList tasks={g.items} showDate={false} />
        </Animated.View>
      ))}
    </>
  );
}

function AnytimeView({ tasks }: { tasks: readonly Task[] }) {
  const list = anytimeTasks(tasks);
  if (!list.length) {
    return <EmptyState icon="tray" title="No someday tasks" body="Tasks without a date wait here until you’re ready." />;
  }
  return <TaskList tasks={list} />;
}

function DoneView({ tasks, limit, onMore }: { tasks: readonly Task[]; limit: number; onMore: () => void }) {
  const list = doneTasks(tasks);
  if (!list.length) {
    return (
      <EmptyState icon="check-circle" title="Nothing finished yet" body="Completed tasks land here. Tap a check to reopen one." />
    );
  }
  return (
    <>
      <TaskList tasks={list.slice(0, limit)} />
      {list.length > limit ? (
        <View style={styles.more}>
          <LinkText label={`Show ${Math.min(DONE_PAGE, list.length - limit)} more`} onPress={onMore} testID="done-more" />
        </View>
      ) : null}
    </>
  );
}

const NO_IGNORE: ReadonlySet<ChipKind> = new Set();

/** Inline add with live parsing: dates, times, !priority, #tags and repeats become chips. */
function QuickAdd({ fallbackDay, tag }: { fallbackDay: DayKey | null; tag: string | null }) {
  const c = useTheme();
  const today = useClock((s) => s.today);
  const now = useClock((s) => s.now);
  const weekStart = useSettings((s) => s.weekStart);
  const remindByDefault = useSettings((s) => s.remindByDefault);
  const [text, setText] = useState('');
  const [ignore, setIgnore] = useState<ReadonlySet<ChipKind>>(NO_IGNORE);
  const [focused, setFocused] = useState(false);

  const parsed = parseTask(text, { today, now, weekStart, ignore });
  const dueDate = parsed.dueDate ?? (parsed.repeat !== 'none' ? today : fallbackDay);
  const ready = parsed.title.length > 0;

  const submit = () => {
    if (!ready) return;
    const created = useTasks.getState().create({
      title: parsed.title,
      dueDate,
      dueTime: parsed.dueTime,
      priority: parsed.priority,
      tag: parsed.tag ?? tag,
      repeat: parsed.repeat,
      remind: remindByDefault && dueDate !== null,
    });
    if (!created) return;
    haptic('soft');
    setText('');
    setIgnore(NO_IGNORE);
  };

  const showFallback = ready && parsed.dueDate === null && dueDate !== null;

  return (
    <View>
      <View style={[styles.add, { backgroundColor: c.surface, borderColor: focused ? c.accent : c.line }]}>
        <Icon name="plus" size={18} color={focused ? c.accent : c.ink3} weight="bold" />
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (!v) setIgnore(NO_IGNORE);
          }}
          onSubmitEditing={submit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          submitBehavior="submit"
          returnKeyType="done"
          placeholder="Add a task"
          placeholderTextColor={c.ink3}
          selectionColor={c.accent}
          cursorColor={c.accent}
          keyboardAppearance={c.scheme}
          maxLength={LIMITS.title + 80}
          maxFontSizeMultiplier={1.4}
          accessibilityLabel="New task"
          accessibilityHint="Dates, times, priority with !, tags with # are picked up as you type."
          testID="quick-add"
          style={[typo.body, styles.addInput, { color: c.ink }, webInput]}
        />
        {ready ? (
          <IconButton icon="arrow-up" label="Add task" onPress={submit} tone="ink" size={34} weight="bold" testID="quick-add-submit" />
        ) : null}
      </View>
      {ready && (parsed.chips.length || showFallback || (tag && !parsed.tag)) ? (
        <Animated.View entering={FadeIn.duration(160)} style={styles.chips}>
          {showFallback && dueDate ? <Chip size="sm" icon="calendar-blank" label={formatDay(dueDate, today)} /> : null}
          {parsed.chips.map((chip) => (
            <Chip
              key={chip.kind}
              size="sm"
              tone="accent"
              label={chip.label}
              onRemove={() => {
                haptic('select');
                setIgnore(new Set([...ignore, chip.kind]));
              }}
              accessibilityLabel={`Keep “${chip.label}” in the title`}
            />
          ))}
          {tag && !parsed.tag ? <Chip size="sm" label={`#${tag}`} /> : null}
        </Animated.View>
      ) : focused && !text ? (
        <T variant="small" color="ink3" style={styles.tip}>
          Try “call bank tomorrow 10am !!” or “standup notes every weekday #work”
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingTop: 4 },
  sticky: { paddingHorizontal: space.page, paddingTop: space.md, paddingBottom: space.sm },
  body: { paddingHorizontal: space.page, paddingTop: space.md, gap: space.xl },
  tagScroll: { marginHorizontal: -space.page, marginTop: -space.sm },
  tags: { gap: space.sm, paddingHorizontal: space.page },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 50,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  addInput: { flex: 1, paddingVertical: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.sm },
  tip: { marginTop: space.sm, marginLeft: 4 },
  more: { alignItems: 'center', paddingVertical: space.md },
});
