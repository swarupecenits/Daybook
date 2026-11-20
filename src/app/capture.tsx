import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type TextInputInstance,
  type TextInputKeyPressEvent,
} from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Avatar } from '@/components/avatar';
import { Button, IconButton } from '@/components/button';
import { Chip } from '@/components/chip';
import { webInput } from '@/components/form';
import { FriendPill } from '@/components/friend-pill';
import { Icon, type IconName } from '@/components/icon';
import { LinkText } from '@/components/layout';
import { Overlays } from '@/components/overlays';
import { Press } from '@/components/press';
import { T } from '@/components/text';
import { signed, standing } from '@/lib/balances';
import {
  captureIntent,
  planCapture,
  type CapturePlan,
  type ExpensePlan,
  type LogPlan,
  type MoneyPlan,
  type NotePlan,
  type TaskPlan,
} from '@/lib/capture';
import { category, METHODS } from '@/lib/categories';
import { formatDay, formatDayLong, formatTime, isDayKey, monthOf } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { INTENTS, splitPrefix, type Intent } from '@/lib/intent';
import { LIMITS } from '@/lib/limits';
import type { ChipKind } from '@/lib/parse-task';
import { inMonth, spent } from '@/lib/spending';
import { goBack } from '@/lib/system';
import { firstName, parseLine, wordCount } from '@/lib/text';
import type { DayKey, Entry, EntryKind, Priority, TimeKey } from '@/lib/types';
import { useClock } from '@/stores/clock';
import { useLedger } from '@/stores/ledger';
import { useLogs } from '@/stores/logs';
import { useNotes } from '@/stores/notes';
import { useSettings } from '@/stores/settings';
import { useTasks } from '@/stores/tasks';
import { toast } from '@/stores/toast';
import { fonts, radius, space, springs, useMoney, useTheme } from '@/theme';

type Meta = {
  label: string;
  icon: IconName;
  action: string;
  placeholder: string;
  /** Heading and body of the hint shown while the field is empty. */
  hint: string;
  tip: string;
};

const META: Record<Intent, Meta> = {
  task: {
    label: 'Task',
    icon: 'check-circle',
    action: 'Add task',
    placeholder: 'Call the bank tomorrow 10am',
    hint: 'Plain words work',
    tip: 'Dates, times, !priority, #tags and repeats are picked up as you type.',
  },
  note: {
    label: 'Note',
    icon: 'note-pencil',
    action: 'Save note',
    placeholder: 'A title on the first line…',
    hint: 'Long or short',
    tip: 'A short first line becomes the title. “- [ ]” starts a checklist; #tags file it.',
  },
  log: {
    label: 'Log',
    icon: 'clock-counter-clockwise',
    action: 'Log it',
    placeholder: 'Shipped the onboarding flow',
    hint: 'For your standup',
    tip: 'A timestamped line in today’s work log, ready to share as a standup.',
  },
  expense: {
    label: 'Spent',
    icon: 'receipt',
    action: 'Add expense',
    placeholder: 'Lunch 250',
    hint: 'What and how much',
    tip: '“lunch 250”, “uber 180”, “₹1.2k groceries”. The category picks itself.',
  },
  money: {
    label: 'IOU',
    icon: 'handshake',
    action: 'Save',
    placeholder: 'Asha 500 for dinner',
    hint: 'Who and how much',
    tip: '“lent Asha 500”, “got 200 from Ravi”, “Meera owes me 1k”.',
  },
};

const EXAMPLES = [
  'call bank tomorrow 10am !!',
  'lunch 250',
  'lent Asha 500 for dinner',
  'log: reviewed the Q3 deck',
  'standup notes every weekday #work',
  'note: gift ideas',
];

const NO_IGNORE: ReadonlySet<ChipKind> = new Set();

const PRIORITY_INK: Record<Priority, 'ink2' | 'accent' | 'warning' | 'negative'> = {
  0: 'ink2',
  1: 'accent',
  2: 'warning',
  3: 'negative',
};

type Draft = { text: string; locked: Intent | null; at: number };

const PARK_MS = 10 * 60_000;

/** The last unsaved capture, kept in memory only, so closing by accident doesn't lose it. */
let parked: Draft | null = null;

function takeParked(fixed: Intent | null): Draft | null {
  const p = parked;
  if (!p || Date.now() - p.at > PARK_MS) return null;
  return fixed === null || p.locked === fixed ? p : null;
}

function park(text: string, locked: Intent | null) {
  parked = text.trim() ? { text, locked, at: Date.now() } : null;
}

function unpark() {
  parked = null;
}

/** Router params without the blanks, so they don't arrive as the string "undefined". */
function defined(params: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') out[k] = v;
  return out;
}

export default function CaptureScreen() {
  const params = useLocalSearchParams<{ intent?: string; day?: string }>();
  const fixed = INTENTS.find((i) => i === params.intent) ?? null;
  const day = isDayKey(params.day) ? params.day : null;
  return (
    <GestureHandlerRootView style={styles.flex}>
      <Composer fixed={fixed} day={day} />
      <Overlays toasts={false} />
    </GestureHandlerRootView>
  );
}

type Flip = { from: EntryKind | null; to: EntryKind };

function Composer({ fixed, day }: { fixed: Intent | null; day: DayKey | null }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screen } = useWindowDimensions();
  const money = useMoney();
  const today = useClock((s) => s.today);
  const now = useClock((s) => s.now);
  const weekStart = useSettings((s) => s.weekStart);
  const remindByDefault = useSettings((s) => s.remindByDefault);
  const people = useLedger((s) => s.people);
  const expenses = useLedger((s) => s.expenses);

  const [restored] = useState(() => takeParked(fixed));
  const [text, setText] = useState(restored?.text ?? '');
  const [locked, setLocked] = useState<Intent | null>(restored ? restored.locked : fixed);
  const [ignore, setIgnore] = useState<ReadonlySet<ChipKind>>(NO_IGNORE);
  const [flip, setFlip] = useState<Flip | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when the user takes the opened-for day off a task, leaving it for Anytime.
  const [undated, setUndated] = useState(false);
  const input = useRef<TextInputInstance>(null);
  const closing = useRef(false);

  const empty = !text.trim();
  const intent = locked ?? captureIntent(text, people);
  const plan = planCapture(intent, text, {
    today,
    now,
    weekStart,
    day: undated ? null : day,
    ignore,
    people,
    expenses,
    pick,
  });
  // A flip only holds while the words still point the same way as when it was made.
  const kind: EntryKind =
    plan.intent === 'money' ? (flip && flip.from === plan.kind ? flip.to : (plan.kind ?? 'gave')) : 'gave';
  const meta = META[intent];
  const idle = empty && locked === null;
  const submits = intent !== 'note';
  const fromDraft = restored !== null && text === restored.text;

  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const panel = useSharedValue(screen);
  const keyboard = useReanimatedKeyboardAnimation();
  const bottomInset = insets.bottom;

  useEffect(() => {
    progress.set(withSpring(1, springs.sheet));
  }, [progress]);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    goBack();
  };

  const pan = usePanGesture({
    activeOffsetY: 8,
    failOffsetX: [-24, 24],
    onUpdate: (e) => {
      'worklet';
      drag.set(Math.max(0, e.translationY));
    },
    onDeactivate: (e) => {
      'worklet';
      if (!e.canceled && (e.translationY > Math.min(120, panel.get() * 0.3) || e.velocityY > 900)) {
        scheduleOnRN(close);
      } else {
        drag.set(withSpring(0, springs.snappy));
      }
    },
  });

  const backdrop = useAnimatedStyle(() => ({
    opacity: progress.get() * (1 - Math.min(1, drag.get() / Math.max(panel.get(), 1))),
  }));
  const lift = useAnimatedStyle(() => ({
    // Rides above the keyboard; its height is negative while open and already covers the home indicator.
    transform: [
      { translateY: (1 - progress.get()) * 56 + drag.get() + Math.min(0, keyboard.height.get() + bottomInset) },
    ],
  }));

  const change = (value: string) => {
    // "note:", "log:", "t:", "spent:"… pick the kind and step out of the way.
    const prefix = splitPrefix(value);
    const lock = prefix ? prefix.intent : locked;
    const next = prefix ? prefix.rest : value;
    const clean = next.trim() ? next : '';
    if (prefix && lock !== locked) haptic('select');
    setText(clean);
    setLocked(lock);
    setError(null);
    if (!clean) {
      setIgnore(NO_IGNORE);
      setFlip(null);
      setPick(null);
      setUndated(false);
    }
    park(clean, lock);
  };

  const refocus = () => input.current?.focus();

  const clear = () => {
    change('');
    setLocked(fixed);
    refocus();
  };

  const tryExample = (example: string) => {
    change(example);
    refocus();
  };

  const choose = (next: Intent) => {
    const lock = locked === next ? null : next;
    setLocked(lock);
    setError(null);
    park(text, lock);
    refocus();
  };

  const fail = () => {
    haptic('error');
    setError('That didn’t save. Please try again.');
  };

  const leave = () => {
    closing.current = true;
    unpark();
  };

  const save = () => {
    if (closing.current) return;
    if (!plan.ready) {
      haptic('warning');
      return;
    }
    const saved = commit(plan, { kind, today, now, remind: remindByDefault, money });
    if (!saved) {
      fail();
      return;
    }
    leave();
    haptic('success');
    toast({
      message: saved.message,
      icon: saved.icon,
      tone: 'success',
      action: { label: 'Undo', onPress: saved.undo },
    });
    goBack();
  };

  const more = () => {
    if (closing.current) return;
    switch (plan.intent) {
      case 'task': {
        const task = plan.ready ? createTask(plan, remindByDefault) : null;
        if (!task) {
          fail();
          return;
        }
        leave();
        router.replace({ pathname: '/task/[id]', params: { id: task.id } });
        return;
      }
      case 'note': {
        const note = useNotes.getState().create({ title: plan.title, body: plan.body });
        if (!note) {
          fail();
          return;
        }
        leave();
        router.replace({ pathname: '/note/[id]', params: { id: note.id, fresh: '1' } });
        return;
      }
      case 'expense':
        leave();
        router.replace({
          pathname: '/expense/[id]',
          params: { id: 'new', ...defined({ amount: plan.amount?.toString(), title: plan.title, day: plan.day }) },
        });
        return;
      case 'money': {
        // With several friends of that name, let the full form ask rather than add another.
        const name = plan.person || plan.choices.length ? undefined : plan.name;
        leave();
        router.replace({
          pathname: '/entry/[id]',
          params: {
            id: 'new',
            ...defined({
              person: plan.person?.id,
              name,
              kind,
              amount: plan.amount?.toString(),
              note: plan.note,
              day: plan.day,
            }),
          },
        });
        return;
      }
      case 'log':
        return;
    }
  };

  const onWebKey = (e: TextInputKeyPressEvent) => {
    const key = e.nativeEvent.key;
    const dom = e.nativeEvent as unknown as { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; isComposing?: boolean };
    if (key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (key !== 'Enter' || dom.isComposing) return;
    // Enter saves; Shift+Enter breaks the line. Notes keep Enter for new lines and save on ⌘/Ctrl+Enter.
    if (submits ? !dom.shiftKey : dom.metaKey || dom.ctrlKey) {
      e.preventDefault();
      save();
    }
  };

  const flipKind = () => {
    if (plan.intent === 'money') setFlip({ from: plan.kind, to: kind === 'gave' ? 'got' : 'gave' });
    refocus();
  };

  const pickFriend = (id: string) => {
    setPick(id);
    refocus();
  };

  const removeChip = (chip: ChipKind) => {
    setIgnore(new Set([...ignore, chip]));
    refocus();
  };

  const dropDay = () => {
    setUndated(true);
    refocus();
  };

  const stamp =
    day && day !== today ? `For ${formatDayLong(day)}` : `${formatDayLong(today)} · ${formatTime(now)}`;
  let moreLabel: string | null = null;
  if (plan.intent === 'task') moreLabel = plan.ready ? 'Add details' : null;
  else if (plan.intent === 'note') moreLabel = 'Open editor';
  else if (plan.intent === 'expense') moreLabel = 'Split or edit';
  else if (plan.intent === 'money') moreLabel = 'More options';

  return (
    <View style={styles.flex}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }, backdrop]}>
        <Pressable
          style={styles.flex}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
          testID="capture-scrim"
        />
      </Animated.View>
      <Animated.View style={[styles.dock, lift]}>
        <View
          accessibilityViewIsModal
          onLayout={(e) => panel.set(e.nativeEvent.layout.height)}
          testID="capture"
          style={[
            styles.panel,
            { backgroundColor: c.surface, borderColor: c.line, paddingBottom: insets.bottom + space.lg },
          ]}>
          <GestureDetector gesture={pan}>
            <View style={styles.handle}>
              <View style={[styles.grabber, { backgroundColor: c.lineStrong }]} />
              <View style={styles.header}>
                <T variant="label" color="ink3" numberOfLines={1} style={styles.flex}>
                  {fromDraft ? 'Unsaved draft' : stamp}
                </T>
                {fromDraft ? <LinkText label="Clear" onPress={clear} testID="capture-clear" /> : null}
                <IconButton
                  icon="x"
                  label="Close"
                  onPress={close}
                  size={32}
                  iconSize={15}
                  tone="surface"
                  weight="bold"
                  testID="capture-close"
                />
              </View>
            </View>
          </GestureDetector>

          <TextInput
            ref={input}
            value={text}
            onChangeText={change}
            onSubmitEditing={submits ? save : undefined}
            onKeyPress={Platform.OS === 'web' ? onWebKey : undefined}
            submitBehavior={submits ? 'submit' : 'newline'}
            returnKeyType={submits ? 'done' : 'default'}
            multiline
            autoFocus
            autoCapitalize="sentences"
            placeholder={locked ? meta.placeholder : 'Jot anything…'}
            placeholderTextColor={c.ink3}
            selectionColor={c.accent}
            cursorColor={c.accent}
            keyboardAppearance={c.scheme}
            maxLength={
              locked === null || locked === 'note' ? LIMITS.body : locked === 'log' ? LIMITS.log : LIMITS.title + 80
            }
            maxFontSizeMultiplier={1.3}
            accessibilityLabel={locked ? `New ${meta.label.toLowerCase()}` : 'Quick capture'}
            accessibilityHint="Sorted into a task, note, log, expense or IOU as you type. Start with note:, log: or spent: to choose."
            testID="capture-input"
            style={[
              styles.input,
              { color: c.ink, maxHeight: Math.max(84, Math.round(screen * 0.24)) },
              webInput,
            ]}
          />
          {error ? (
            <T variant="small" color="negative" accessibilityRole="alert" style={styles.error}>
              {error}
            </T>
          ) : null}

          <View style={[styles.ticket, { backgroundColor: c.bg, borderColor: c.line }]} testID="capture-preview">
            <Animated.View
              key={empty ? `hint-${locked ?? 'auto'}` : intent}
              entering={FadeIn.duration(160)}
              style={styles.ticketBody}>
              {empty ? (
                <Hint intent={intent} auto={locked === null} onTry={tryExample} />
              ) : (
                <Preview
                  plan={plan}
                  kind={kind}
                  today={today}
                  now={now}
                  onRemoveChip={removeChip}
                  onDropDay={dropDay}
                  onFlip={flipKind}
                  onPick={pickFriend}
                />
              )}
            </Animated.View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            style={styles.bleed}
            contentContainerStyle={styles.intents}>
            {INTENTS.map((i) => {
              const on = i === intent && !idle;
              const auto = on && locked === null;
              return (
                <Chip
                  key={i}
                  size="sm"
                  label={META[i].label}
                  icon={auto ? 'sparkle' : META[i].icon}
                  selected={on}
                  onPress={() => choose(i)}
                  accessibilityLabel={auto ? `${META[i].label}, picked from what you typed` : META[i].label}
                  testID={`capture-intent-${i}`}
                />
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            {moreLabel ? <LinkText label={moreLabel} onPress={more} testID="capture-more" /> : <View />}
            <Button
              label={idle ? 'Save' : meta.action}
              onPress={save}
              variant="ink"
              disabled={!plan.ready}
              haptic={false}
              testID="capture-save"
            />
          </View>
          <View style={[styles.overshoot, { backgroundColor: c.surface }]} />
        </View>
      </Animated.View>
    </View>
  );
}

type Saved = { message: string; icon: IconName; undo: () => void };

const clip = (text: string, max = 32) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

type CommitOptions = {
  kind: EntryKind;
  today: DayKey;
  now: TimeKey;
  remind: boolean;
  money: (minor: number) => string;
};

function createTask(plan: TaskPlan, remind: boolean) {
  const { task, dueDate } = plan;
  return useTasks.getState().create({
    title: task.title,
    dueDate,
    dueTime: task.dueTime,
    priority: task.priority,
    tag: task.tag,
    repeat: task.repeat,
    remind: remind && dueDate !== null,
  });
}

function balanceOf(entries: readonly Entry[], personId: string): number {
  let total = 0;
  for (const e of entries) if (e.personId === personId && e.deletedAt === null) total += signed(e);
  return total;
}

function commit(plan: CapturePlan, o: CommitOptions): Saved | null {
  switch (plan.intent) {
    case 'task': {
      const task = createTask(plan, o.remind);
      if (!task) return null;
      const when = task.dueDate
        ? [formatDay(task.dueDate, o.today), task.dueTime ? formatTime(task.dueTime) : null].filter(Boolean).join(', ')
        : 'Anytime';
      return { message: `Task added · ${when}`, icon: 'check-circle', undo: () => useTasks.getState().destroy(task.id) };
    }
    case 'note': {
      const note = useNotes.getState().create({ title: plan.title, body: plan.body });
      if (!note) return null;
      return {
        message: note.title ? `Saved “${clip(note.title)}” to Notes` : 'Saved to Notes',
        icon: 'note-pencil',
        undo: () => useNotes.getState().destroy(note.id),
      };
    }
    case 'log': {
      const log = useLogs.getState().add(plan.text, plan.day);
      if (!log) return null;
      const when = plan.day === o.today ? formatTime(o.now) : formatDay(plan.day, o.today);
      return {
        message: `Logged · ${when}`,
        icon: 'clock-counter-clockwise',
        undo: () => useLogs.getState().destroy(log.id),
      };
    }
    case 'expense': {
      if (plan.amount === null) return null;
      const expense = useLedger.getState().saveExpense(null, {
        title: plan.title,
        amount: plan.amount,
        share: plan.amount,
        category: plan.category,
        method: plan.method,
        date: plan.day,
        note: '',
        paidBy: 'me',
        split: [],
      });
      if (!expense) return null;
      return {
        message: `${o.money(expense.amount)} on ${clip(expense.title)}`,
        icon: category(expense.category).icon,
        undo: () => useLedger.getState().destroyExpense(expense.id),
      };
    }
    case 'money':
      return commitMoney(plan, o);
  }
}

function commitMoney(plan: MoneyPlan, o: CommitOptions): Saved | null {
  if (!plan.ready || plan.amount === null || !plan.name) return null;
  const ledger = useLedger.getState();
  const existing = plan.person;
  const person = existing ?? ledger.addPerson({ name: plan.name });
  if (!person) return null;
  const pid = person.id;
  const unarchived = existing?.archived === true;
  if (unarchived) ledger.updatePerson(pid, { archived: false });
  const entry = ledger.addEntry({ personId: pid, kind: o.kind, amount: plan.amount, note: plan.note, date: plan.day });
  const revert = (keep: string | null) => {
    const l = useLedger.getState();
    if (existing) {
      if (unarchived) l.updatePerson(pid, { archived: true });
    } else if (!l.entries.some((e) => e.personId === pid && e.id !== keep)) {
      // Only take back a friend this capture created, and only while they have nothing else.
      l.destroyPerson(pid);
    }
  };
  if (!entry) {
    revert(null);
    return null;
  }
  return {
    message: standing(firstName(person.name), balanceOf(useLedger.getState().entries, pid), o.money),
    icon: o.kind === 'gave' ? 'arrow-up-right' : 'arrow-down-left',
    undo: () => {
      useLedger.getState().destroyEntry(entry.id);
      revert(entry.id);
    },
  };
}

function Tile({ icon, color, bg }: { icon: IconName; color: string; bg: string }) {
  return (
    <View style={[styles.tile, { backgroundColor: bg }]}>
      <Icon name={icon} size={18} color={color} weight="bold" />
    </View>
  );
}

type LineProps = {
  lead: ReactNode;
  title: string;
  muted?: boolean;
  detail?: string | null;
  detailColor?: 'ink2' | 'ink3' | 'negative' | 'warning';
  right?: ReactNode;
};

function Line({ lead, title, muted, detail, detailColor = 'ink3', right }: LineProps) {
  return (
    <View style={styles.line}>
      {lead}
      <View style={styles.lineText}>
        <T variant="bodyMedium" color={muted ? 'ink3' : 'ink'} numberOfLines={2}>
          {title}
        </T>
        {detail ? (
          <T variant="small" color={detailColor} numberOfLines={2}>
            {detail}
          </T>
        ) : null}
      </View>
      {right}
    </View>
  );
}

function Hint({ intent, auto, onTry }: { intent: Intent; auto: boolean; onTry: (text: string) => void }) {
  const c = useTheme();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % EXAMPLES.length), 3200);
    return () => clearInterval(timer);
  }, [auto]);
  const example = EXAMPLES[index];
  if (!auto) {
    const meta = META[intent];
    return <Line lead={<Tile icon={meta.icon} color={c.ink2} bg={c.surface2} />} title={meta.hint} detail={meta.tip} />;
  }
  return (
    <View style={styles.line}>
      <Tile icon="sparkle" color={c.accent} bg={c.accentSoft} />
      <View style={styles.lineText}>
        <T variant="bodyMedium">Type anything. It sorts itself.</T>
        <Press
          onPress={() => onTry(example)}
          hitSlop={8}
          scale={0.97}
          haptic="select"
          accessibilityLabel={`Try: ${example}`}
          testID="capture-example">
          <Animated.View key={example} entering={FadeIn.duration(260)}>
            <T variant="caption" color="accent" numberOfLines={1}>
              Try “{example}”
            </T>
          </Animated.View>
        </Press>
      </View>
    </View>
  );
}

type PreviewProps = {
  plan: CapturePlan;
  kind: EntryKind;
  today: DayKey;
  now: TimeKey;
  onRemoveChip: (chip: ChipKind) => void;
  onDropDay: () => void;
  onFlip: () => void;
  onPick: (id: string) => void;
};

function Preview({ plan, kind, today, now, onRemoveChip, onDropDay, onFlip, onPick }: PreviewProps) {
  switch (plan.intent) {
    case 'task':
      return <TaskTicket plan={plan} today={today} onRemove={onRemoveChip} onDropDay={onDropDay} />;
    case 'note':
      return <NoteTicket plan={plan} />;
    case 'log':
      return <LogTicket plan={plan} today={today} now={now} />;
    case 'expense':
      return <ExpenseTicket plan={plan} today={today} />;
    case 'money':
      return <MoneyTicket plan={plan} kind={kind} today={today} onFlip={onFlip} onPick={onPick} />;
  }
}

type TaskTicketProps = { plan: TaskPlan; today: DayKey; onRemove: (chip: ChipKind) => void; onDropDay: () => void };

function TaskTicket({ plan, today, onRemove, onDropDay }: TaskTicketProps) {
  const c = useTheme();
  const { task, dueDate } = plan;
  const list = dueDate === null ? 'Anytime' : dueDate <= today ? 'Today' : 'Upcoming';
  return (
    <>
      <Line
        lead={<Tile icon="check-circle" color={c[PRIORITY_INK[task.priority]]} bg={c.surface2} />}
        title={task.title || 'A few words for the task'}
        muted={!task.title}
        detail={`Tasks · ${list}`}
      />
      {task.chips.length || plan.fallback ? (
        <View style={styles.chips}>
          {plan.fallback && dueDate ? (
            <Chip
              size="sm"
              icon="calendar-blank"
              label={formatDay(dueDate, today)}
              onRemove={task.repeat === 'none' ? onDropDay : undefined}
              accessibilityLabel={task.repeat === 'none' ? `Remove ${formatDay(dueDate, today)}, leave it for anytime` : undefined}
            />
          ) : null}
          {task.chips.map((chip) => (
            <Chip
              key={chip.kind}
              size="sm"
              tone="accent"
              label={chip.label}
              onRemove={() => onRemove(chip.kind)}
              accessibilityLabel={`Keep “${chip.label}” in the title`}
            />
          ))}
        </View>
      ) : null}
    </>
  );
}

function NoteTicket({ plan }: { plan: NotePlan }) {
  const c = useTheme();
  const raw = plan.title || plan.body.split('\n').find((l) => l.trim()) || '';
  const first = parseLine(raw.trim(), 0).text.trim();
  const words = wordCount(`${plan.title} ${plan.body}`);
  const tags = plan.tags
    .slice(0, 4)
    .map((t) => `#${t}`)
    .join(' ');
  return (
    <Line
      lead={<Tile icon="note-pencil" color={c.ink2} bg={c.paper.butter} />}
      title={first || 'Untitled note'}
      muted={!first}
      detail={[`Notes · ${words} ${words === 1 ? 'word' : 'words'}`, tags].filter(Boolean).join(' · ')}
    />
  );
}

function LogTicket({ plan, today, now }: { plan: LogPlan; today: DayKey; now: TimeKey }) {
  const c = useTheme();
  const when = plan.day === today ? formatTime(now) : formatDay(plan.day, today);
  return (
    <Line
      lead={<Tile icon="clock-counter-clockwise" color={c.accent} bg={c.accentSoft} />}
      title={plan.text}
      detail={`Work log · ${when}`}
    />
  );
}

function ExpenseTicket({ plan, today }: { plan: ExpensePlan; today: DayKey }) {
  const c = useTheme();
  const money = useMoney();
  const budget = useSettings((s) => s.budget);
  const expenses = useLedger((s) => s.expenses);
  const cat = category(plan.category);
  const tint = cat.color[c.scheme === 'dark' ? 1 : 0];
  const method = METHODS.find((m) => m.id === plan.method);
  const month = monthOf(plan.day);
  const left =
    budget > 0 && plan.amount !== null && month === monthOf(today)
      ? budget - spent(inMonth(expenses, month)) - plan.amount
      : null;
  const priced = plan.amount !== null;
  return (
    <>
      <Line
        lead={<Tile icon={cat.icon} color={tint} bg={`${tint}24`} />}
        title={plan.title || (priced ? cat.label : 'What was it?')}
        muted={!plan.title && !priced}
        detail={
          priced
            ? [cat.label, method?.label, formatDay(plan.day, today)].filter(Boolean).join(' · ')
            : 'Add the amount, like “lunch 250”'
        }
        right={
          <T variant="amount" color={priced ? 'ink' : 'ink3'}>
            {plan.amount !== null ? money(plan.amount) : '—'}
          </T>
        }
      />
      {left !== null ? (
        <T variant="small" color={left < 0 ? 'negative' : 'ink3'} style={styles.indent}>
          {left < 0 ? `${money(-left)} over this month’s budget` : `${money(left)} left in this month’s budget`}
        </T>
      ) : null}
    </>
  );
}

function MoneyTicket({
  plan,
  kind,
  today,
  onFlip,
  onPick,
}: {
  plan: MoneyPlan;
  kind: EntryKind;
  today: DayKey;
  onFlip: () => void;
  onPick: (id: string) => void;
}) {
  const c = useTheme();
  const money = useMoney();
  const entries = useLedger((s) => s.entries);

  if (plan.amount === null || !plan.name) {
    return (
      <Line
        lead={<Tile icon="handshake" color={c.ink2} bg={c.surface2} />}
        title={plan.amount !== null ? `${money(plan.amount)} with whom?` : 'Who and how much?'}
        muted
        detail={plan.amount !== null ? 'Add a name, like “Asha 500”' : META.money.tip}
      />
    );
  }

  const first = firstName(plan.name);
  const amount = money(plan.amount);
  const asking = plan.person === null && plan.choices.length > 0;
  const after = (plan.person ? balanceOf(entries, plan.person.id) : 0) + signed({ kind, amount: plan.amount });
  const fresh = plan.person === null && !asking;
  // Among several friends of one name, say which one.
  const who = plan.choices.length ? plan.name : first;
  const dated = plan.day !== today;

  return (
    <>
      <Line
        lead={<Avatar name={plan.name} size={36} />}
        title={asking ? `Which ${first}?` : kind === 'gave' ? `You gave ${who} ${amount}` : `You got ${amount} from ${who}`}
        detail={asking ? `${plan.choices.length} friends go by ${first}` : `After this, ${standing(first, after, money, false)}`}
        right={
          asking ? null : (
            <IconButton
              icon="repeat"
              label={kind === 'gave' ? 'Switch to money you got' : 'Switch to money you gave'}
              onPress={onFlip}
              size={34}
              iconSize={16}
              tone="surface"
              weight="bold"
              haptic="select"
              testID="capture-flip"
            />
          )
        }
      />
      {plan.choices.length ? (
        <View style={styles.chips}>
          {plan.choices.slice(0, 6).map((p) => (
            <FriendPill key={p.id} name={p.name} selected={p.id === plan.person?.id} onPress={() => onPick(p.id)} />
          ))}
        </View>
      ) : null}
      {fresh || dated || plan.note || plan.person?.archived ? (
        <View style={styles.chips}>
          {fresh ? <Chip size="sm" tone="accent" icon="user-plus" label="New friend" /> : null}
          {dated ? <Chip size="sm" icon="calendar-blank" label={formatDay(plan.day, today)} /> : null}
          {plan.person?.archived ? <Chip size="sm" icon="archive" label="Back from archive" /> : null}
          {plan.note ? (
            <T variant="small" color="ink2" numberOfLines={1} style={styles.note}>
              “{plan.note}”
            </T>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  panel: {
    width: '100%',
    maxWidth: 640,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingHorizontal: space.page,
  },
  handle: { paddingTop: 10 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 34 },
  input: {
    fontFamily: fonts.sansMedium,
    fontSize: 20,
    lineHeight: 27,
    minHeight: 48,
    paddingTop: Platform.OS === 'ios' ? 8 : 6,
    paddingBottom: 8,
    paddingHorizontal: 0,
    textAlignVertical: 'top',
  },
  error: { marginBottom: 4 },
  ticket: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    minHeight: 64,
    justifyContent: 'center',
    marginTop: 4,
  },
  ticketBody: { gap: space.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  lineText: { flex: 1, gap: 2 },
  tile: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingLeft: 48 },
  note: { flexShrink: 1 },
  indent: { paddingLeft: 48 },
  bleed: { marginHorizontal: -space.page, marginTop: space.md, flexGrow: 0 },
  intents: { paddingHorizontal: space.page, gap: 6 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    marginTop: space.lg,
  },
  overshoot: { position: 'absolute', left: 0, right: 0, top: '100%', height: 400 },
});
