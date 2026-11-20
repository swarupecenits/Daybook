import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { Linking, Platform, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/button';
import { Meter } from '@/components/charts';
import { Chip } from '@/components/chip';
import { DateSheet, TimeSheet } from '@/components/date-sheet';
import { EmptyState } from '@/components/empty-state';
import { Field, Group, Row, Toggle, webInput } from '@/components/form';
import { Icon } from '@/components/icon';
import { Hairline, Screen, SectionLabel, TopBar } from '@/components/layout';
import { Overlays } from '@/components/overlays';
import { Press } from '@/components/press';
import { listLayout } from '@/components/task-list';
import { priorityColor, TaskCheck } from '@/components/task-row';
import { T } from '@/components/text';
import { diffDays, formatDay, formatDayShort, formatTime, relativeTime, toKey, toTimestamp } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { newId } from '@/lib/ids';
import { LIMITS } from '@/lib/limits';
import { priorityLabel, repeatLabel } from '@/lib/parse-task';
import { ensureReminderPermission } from '@/lib/reminders';
import { goBack, shareText } from '@/lib/system';
import { taskTags } from '@/lib/tasks';
import type { Priority, Repeat, Subtask, Task } from '@/lib/types';
import { completeTask, deleteTask, reopenTask } from '@/stores/actions';
import { useClock } from '@/stores/clock';
import { whileAway } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { DEFAULT_REMINDER_TIME, normalizeTag, type TaskDraft, useTasks } from '@/stores/tasks';
import { toast } from '@/stores/toast';
import { radius, space, typo, useTheme } from '@/theme';

const PRIORITIES: readonly Priority[] = [0, 1, 2, 3];
const REPEATS: readonly Repeat[] = ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly'];
const WEB = Platform.OS === 'web';

const findTask = (id: string) => useTasks.getState().tasks.find((t) => t.id === id);
const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

export default function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const found = useTasks((s) => s.tasks.find((t) => t.id === id));
  const live = found?.deletedAt === null ? found : undefined;
  // After a delete the modal is still sliding away; keep showing what was there.
  const [last, setLast] = useState(live);
  const [leaving, setLeaving] = useState(false);
  if (live && live !== last) setLast(live);
  const task = live ?? (leaving ? last : undefined);

  return (
    <Screen>
      {task ? <Editor key={task.id} task={task} onLeave={() => setLeaving(true)} /> : <Missing />}
      <Overlays />
    </Screen>
  );
}

function Missing() {
  return (
    <>
      <TopBar modal />
      <EmptyState
        icon="tray"
        title="This task isn’t here"
        body="It may have been deleted. Anything removed in the last 30 days is in Trash."
        action={{ label: 'Close', onPress: goBack }}
      />
    </>
  );
}

function Editor({ task, onLeave }: { task: Task; onLeave: () => void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const today = useClock((s) => s.today);
  const at = useClock((s) => s.at);
  const remindByDefault = useSettings((s) => s.remindByDefault);
  const tasks = useTasks((s) => s.tasks);
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [tag, setTag] = useState(task.tag ?? '');
  const [sheet, setSheet] = useState<'date' | 'time' | null>(null);

  const id = task.id;
  const done = task.doneAt !== null;
  const update = (patch: Partial<TaskDraft>) => useTasks.getState().update(id, patch);

  // Typing is saved once it pauses, and once more on the way out.
  const save = useEffectEvent(() => {
    const current = findTask(id);
    if (!current) return;
    const patch: Partial<TaskDraft> = {};
    const nextTitle = squash(title);
    if (nextTitle && nextTitle !== current.title) patch.title = nextTitle;
    if (notes !== current.notes) patch.notes = notes;
    const nextTag = normalizeTag(tag);
    if (nextTag !== current.tag) patch.tag = nextTag;
    if (Object.keys(patch).length) useTasks.getState().update(id, patch);
  });
  useEffect(() => {
    const timer = setTimeout(() => save(), 600);
    return () => clearTimeout(timer);
  }, [title, notes, tag]);
  useEffect(() => () => save(), []);

  const remindTime = task.dueTime ?? DEFAULT_REMINDER_TIME;
  const remindPassed = task.dueDate !== null && toTimestamp(task.dueDate, remindTime) <= at;
  const remindDetail = WEB
    ? 'Reminders work in the phone app'
    : !task.dueDate
      ? 'Pick a date first'
      : task.remind && remindPassed && !done
        ? 'That time has already passed'
        : `${formatDay(task.dueDate, today)} at ${formatTime(remindTime)}`;

  const setRemind = async (on: boolean) => {
    if (!on) {
      update({ remind: false });
      return;
    }
    if (!(await ensureReminderPermission())) {
      toast({
        message: 'Notifications are off for Daybook',
        icon: 'bell-slash',
        tone: 'danger',
        action: { label: 'Settings', onPress: () => void whileAway(() => Linking.openSettings()) },
      });
      return;
    }
    update({ remind: true });
  };

  const overdueBy = task.dueDate && !done ? diffDays(task.dueDate, today) : 0;
  const currentTag = normalizeTag(tag);
  const suggestions = taskTags(tasks)
    .filter((t) => t !== currentTag)
    .slice(0, 6);

  const duplicate = () => {
    const source = findTask(id) ?? task;
    const copy = useTasks.getState().create({
      title: squash(title) || source.title,
      notes,
      dueDate: source.dueDate,
      dueTime: source.dueTime,
      priority: source.priority,
      tag: currentTag,
      subtasks: source.subtasks.map((s) => ({ ...s, id: newId(), done: false })),
      repeat: source.repeat,
      remind: source.remind,
    });
    if (!copy) return;
    haptic('success');
    toast({
      message: 'Copy made',
      icon: 'copy',
      tone: 'success',
      action: { label: 'Open', onPress: () => router.setParams({ id: copy.id }) },
    });
  };

  const share = () => {
    const heading = squash(title) || task.title;
    const lines = [heading];
    if (task.dueDate) {
      lines.push(`Due ${formatDay(task.dueDate, today).toLowerCase()}${task.dueTime ? ` at ${formatTime(task.dueTime)}` : ''}`);
    }
    for (const s of task.subtasks) lines.push(`${s.done ? '☑' : '☐'} ${s.title}`);
    if (notes.trim()) lines.push('', notes.trim());
    void shareText(lines.join('\n'), heading);
  };

  const remove = () => {
    onLeave();
    deleteTask(id);
    goBack();
  };

  const footer =
    done && task.doneAt !== null
      ? `Completed ${relativeTime(task.doneAt, at)}`
      : `Added ${formatDayShort(toKey(new Date(task.createdAt)), today)} · edited ${relativeTime(task.updatedAt, at)}`;

  return (
    <>
      <TopBar
        modal
        right={<IconButton icon="export" label="Share task" onPress={share} testID="task-share" />}
      />
      <KeyboardAwareScrollView
        bottomOffset={28}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.xxl }]}>
        <View>
          <View style={styles.head}>
            <View style={styles.checkSlot}>
              <TaskCheck
                done={done}
                priority={task.priority}
                onPress={() => (done ? reopenTask(id) : completeTask(id))}
                label={done ? 'Mark as not done' : 'Complete task'}
                testID="task-check"
              />
            </View>
            <TextInput
              value={title}
              onChangeText={(v) => setTitle(v.replace(/\n/g, ' '))}
              multiline
              scrollEnabled={false}
              submitBehavior="blurAndSubmit"
              returnKeyType="done"
              placeholder="Task title"
              placeholderTextColor={c.ink3}
              selectionColor={c.accent}
              cursorColor={c.accent}
              keyboardAppearance={c.scheme}
              maxLength={LIMITS.title}
              maxFontSizeMultiplier={1.3}
              accessibilityLabel="Task title"
              testID="task-title"
              style={[typo.title, styles.title, { color: done ? c.ink3 : c.ink }, done && styles.strike, webInput]}
            />
          </View>
          {!squash(title) ? (
            <T variant="small" color="negative" style={styles.titleHint}>
              Needs a title. Until it has one, the old title stays.
            </T>
          ) : null}
        </View>

        <Group>
          <Row
            icon="calendar-blank"
            tint={overdueBy > 0 ? c.negative : undefined}
            label="Date"
            value={task.dueDate ? formatDay(task.dueDate, today) : 'No date'}
            detail={overdueBy > 0 ? `Overdue by ${overdueBy} ${overdueBy === 1 ? 'day' : 'days'}` : undefined}
            onPress={() => setSheet('date')}
            chevron
            testID="task-date"
          />
          <Row
            icon="clock"
            label="Time"
            value={task.dueTime ? formatTime(task.dueTime) : 'Any time'}
            onPress={() => setSheet('time')}
            disabled={!task.dueDate}
            chevron
            testID="task-time"
          />
          <Row
            icon={task.remind ? 'bell' : 'bell-slash'}
            label="Remind me"
            detail={remindDetail}
            right={
              <Toggle
                value={task.remind}
                onChange={(on) => void setRemind(on)}
                label="Remind me"
                disabled={WEB || !task.dueDate}
                testID="task-remind"
              />
            }
          />
        </Group>

        <View>
          <SectionLabel label="Priority" />
          <View style={styles.wrap}>
            {PRIORITIES.map((p) => (
              <Chip
                key={p}
                label={priorityLabel(p)}
                dot={p ? priorityColor(c, p) : undefined}
                selected={task.priority === p}
                onPress={() => update({ priority: p })}
                testID={`priority-${p}`}
              />
            ))}
          </View>
        </View>

        <View>
          <SectionLabel label="Repeat" />
          <View style={styles.wrap}>
            {REPEATS.map((r) => (
              <Chip
                key={r}
                label={repeatLabel(r)}
                selected={task.repeat === r}
                onPress={() => update({ repeat: r })}
                testID={`repeat-${r}`}
              />
            ))}
          </View>
          {task.repeat !== 'none' ? (
            <T variant="small" color="ink3" style={styles.hint}>
              Tick it off and the next one is scheduled for you.
            </T>
          ) : null}
        </View>

        <View>
          <SectionLabel label="Tag" />
          <Field
            value={tag}
            onChangeText={(v) => setTag(v.replace(/^#+/, ''))}
            onBlur={() => setTag(normalizeTag(tag) ?? '')}
            prefix="#"
            placeholder="work, home, errands"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            maxLength={LIMITS.tag}
            accessibilityLabel="Tag"
            testID="task-tag"
            right={
              tag ? (
                <IconButton
                  icon="x"
                  label="Clear tag"
                  size={28}
                  iconSize={12}
                  tone="surface"
                  weight="bold"
                  onPress={() => {
                    setTag('');
                    update({ tag: null });
                  }}
                />
              ) : null
            }
          />
          {suggestions.length ? (
            <View style={[styles.wrap, styles.suggest]}>
              {suggestions.map((t) => (
                <Chip
                  key={t}
                  size="sm"
                  label={`#${t}`}
                  onPress={() => {
                    setTag(t);
                    update({ tag: t });
                  }}
                  testID={`suggest-${t}`}
                />
              ))}
            </View>
          ) : null}
        </View>

        <Steps task={task} />

        <View>
          <SectionLabel label="Notes" />
          <Field
            value={notes}
            onChangeText={setNotes}
            multiline
            scrollEnabled={false}
            placeholder="Details, links, anything worth remembering"
            maxLength={LIMITS.taskNotes}
            accessibilityLabel="Notes"
            testID="task-notes"
          />
        </View>

        <Group>
          <Row icon="copy" label="Duplicate" onPress={duplicate} testID="task-duplicate" />
          <Row icon="trash" label="Delete" detail="Kept in Trash for 30 days" danger onPress={remove} testID="task-delete" />
        </Group>

        <T variant="label" color="ink3" align="center">
          {footer}
        </T>
      </KeyboardAwareScrollView>

      <DateSheet
        visible={sheet === 'date'}
        onClose={() => setSheet(null)}
        value={task.dueDate}
        title="When is it due?"
        clearable={task.repeat === 'none'}
        onChange={(day) =>
          update(day && !task.dueDate && remindByDefault && !WEB ? { dueDate: day, remind: true } : { dueDate: day })
        }
      />
      <TimeSheet
        visible={sheet === 'time'}
        onClose={() => setSheet(null)}
        value={task.dueTime}
        title="What time?"
        onChange={(time) => update({ dueTime: time })}
      />
    </>
  );
}

function Steps({ task }: { task: Task }) {
  const c = useTheme();
  const [draft, setDraft] = useState('');
  const steps = task.subtasks;
  const doneCount = steps.filter((s) => s.done).length;
  const full = steps.length >= LIMITS.subtasks;

  // Read the freshest list: a rename can land in the same tick as a toggle.
  const latest = () => findTask(task.id)?.subtasks ?? steps;
  const write = (subtasks: Subtask[]) => useTasks.getState().update(task.id, { subtasks });

  const add = () => {
    const title = squash(draft);
    if (!title || full) return;
    write([...latest(), { id: newId(), title, done: false }]);
    setDraft('');
    haptic('soft');
  };

  return (
    <View>
      <SectionLabel
        label={steps.length ? `Steps · ${doneCount} of ${steps.length}` : 'Steps'}
        right={
          steps.length && doneCount === steps.length ? (
            <T variant="small" color="positive">
              All done
            </T>
          ) : null
        }
      />
      {steps.length ? <Meter value={doneCount / steps.length} color={c.positive} height={4} style={styles.meter} /> : null}
      <Animated.View layout={listLayout} style={[styles.steps, { backgroundColor: c.surface, borderColor: c.line }]}>
        {steps.map((s) => (
          <Animated.View key={s.id} layout={listLayout} entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
            <StepRow
              step={s}
              onToggle={() => {
                haptic('select');
                useTasks.getState().toggleSubtask(task.id, s.id);
              }}
              onRename={(title) => write(latest().map((x) => (x.id === s.id ? { ...x, title } : x)))}
              onRemove={() => {
                haptic('tap');
                write(latest().filter((x) => x.id !== s.id));
              }}
            />
            <Hairline inset={48} />
          </Animated.View>
        ))}
        {full ? (
          <T variant="small" color="ink3" style={styles.full}>
            That’s {LIMITS.subtasks} steps, the most a task can hold.
          </T>
        ) : (
          <View style={styles.step}>
            <View style={styles.stepIcon}>
              <Icon name="plus" size={18} color={c.ink3} weight="bold" />
            </View>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={add}
              submitBehavior="submit"
              returnKeyType="done"
              placeholder={steps.length ? 'Add another step' : 'Break it into steps'}
              placeholderTextColor={c.ink3}
              selectionColor={c.accent}
              cursorColor={c.accent}
              keyboardAppearance={c.scheme}
              maxLength={LIMITS.title}
              maxFontSizeMultiplier={1.4}
              accessibilityLabel="New step"
              testID="step-input"
              style={[typo.callout, styles.stepInput, { color: c.ink }, webInput]}
            />
            {squash(draft) ? (
              <IconButton icon="arrow-up" label="Add step" onPress={add} tone="ink" size={30} weight="bold" testID="step-add" />
            ) : null}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

type StepRowProps = {
  step: Subtask;
  onToggle: () => void;
  onRename: (title: string) => void;
  onRemove: () => void;
};

function StepRow({ step, onToggle, onRename, onRemove }: StepRowProps) {
  const c = useTheme();
  const [text, setText] = useState(step.title);
  const commit = () => {
    const next = squash(text);
    // An emptied step is dropped by the store.
    if (next !== step.title) onRename(next);
    if (next) setText(next);
  };
  return (
    <View style={styles.step}>
      <Press
        onPress={onToggle}
        scale={0.85}
        hitSlop={10}
        accessibilityRole="checkbox"
        aria-checked={step.done}
        accessibilityLabel={step.title}
        testID={`step-check-${step.id}`}
        style={styles.stepIcon}>
        <Icon
          name={step.done ? 'check-square' : 'square'}
          size={22}
          color={step.done ? c.positive : c.ink3}
          weight={step.done ? 'fill' : 'regular'}
        />
      </Press>
      <TextInput
        value={text}
        onChangeText={(v) => setText(v.replace(/\n/g, ' '))}
        onBlur={commit}
        submitBehavior="blurAndSubmit"
        returnKeyType="done"
        selectionColor={c.accent}
        cursorColor={c.accent}
        keyboardAppearance={c.scheme}
        maxLength={LIMITS.title}
        maxFontSizeMultiplier={1.4}
        accessibilityLabel={`Step: ${step.title}`}
        style={[typo.callout, styles.stepInput, { color: step.done ? c.ink3 : c.ink }, step.done && styles.strike, webInput]}
      />
      <IconButton
        icon="x"
        label={`Remove step ${step.title}`}
        onPress={onRemove}
        size={32}
        iconSize={13}
        color={c.ink3}
        weight="bold"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: space.page, paddingTop: space.sm, gap: space.xl },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  checkSlot: { paddingTop: 7 },
  title: { flex: 1, padding: 0, textAlignVertical: 'top' },
  titleHint: { marginTop: 6, marginLeft: 36 },
  strike: { textDecorationLine: 'line-through' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  hint: { marginTop: space.sm, marginLeft: 2 },
  suggest: { marginTop: space.sm },
  meter: { marginBottom: space.md },
  steps: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingLeft: space.md, paddingRight: 6 },
  stepIcon: { width: 26, alignItems: 'center', justifyContent: 'center' },
  stepInput: { flex: 1, paddingVertical: 12 },
  full: { padding: space.lg },
});
