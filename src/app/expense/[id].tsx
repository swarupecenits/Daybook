import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Keyboard, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView, useKeyboardState } from 'react-native-keyboard-controller';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmountDisplay, AmountPad } from '@/components/amount-pad';
import { Avatar } from '@/components/avatar';
import { Button, IconButton } from '@/components/button';
import { Chip, Segmented } from '@/components/chip';
import { DateSheet } from '@/components/date-sheet';
import { EmptyState } from '@/components/empty-state';
import { Field, Toggle } from '@/components/form';
import { FriendPill, NewPill, PillRow } from '@/components/friend-pill';
import { Icon } from '@/components/icon';
import { Hairline, LinkText, Screen, SectionLabel, TopBar } from '@/components/layout';
import { Overlays } from '@/components/overlays';
import { Press } from '@/components/press';
import { type InkColor, T } from '@/components/text';
import { lastActivity } from '@/lib/balances';
import { evaluate, minorToInput, pressKey } from '@/lib/calc';
import { CATEGORIES, category, guessCategory, isCategory, isMethod, METHODS } from '@/lib/categories';
import { formatDay, isDayKey, MONTHS, monthOf } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { LIMITS } from '@/lib/limits';
import { lastMethod } from '@/lib/spending';
import { planEqualSplit, type SplitPlan } from '@/lib/split';
import { goBack } from '@/lib/system';
import { firstName, joinNames } from '@/lib/text';
import type { CategoryId, DayKey, Entry, Expense, PayMethod, Person } from '@/lib/types';
import { deleteExpense } from '@/stores/actions';
import { useClock } from '@/stores/clock';
import { useLedger } from '@/stores/ledger';
import { useSettings } from '@/stores/settings';
import { toast } from '@/stores/toast';
import { radius, space, useMoney, useTheme } from '@/theme';

const MAX_PILLS = 24;
/** Room for the save dock between a focused field and the keyboard. */
const DOCK_TYPING = 96;
/** How much of the previous category stays visible when the strip scrolls to the chosen one. */
const PEEK = 44;
/** Key prefix for people typed in here who aren't friends yet; they're added when the bill is saved. */
const NEW = 'new:';
const METHOD_OPTIONS = METHODS.map((m) => ({ value: m.id, label: m.label }));

type Params = {
  id: string;
  amount?: string;
  title?: string;
  category?: string;
  method?: string;
  day?: string;
  person?: string;
};

type Draft = {
  expr: string;
  title: string;
  cat: CategoryId | null;
  /** A category picked by hand; otherwise it follows the title. */
  manual: boolean;
  method: PayMethod;
  date: DayKey;
  note: string;
  friends: string[];
  includeMe: boolean;
  paidBy: string;
  row: string[];
  pad: boolean;
};

type Line = { key: string; name: string; amount: number };
type Option = { key: string; name: string };

const nameKey = (name: string) => name.replace(/\s+/g, ' ').trim().toLocaleLowerCase();

export default function ExpenseScreen() {
  const params = useLocalSearchParams<Params>();
  const isNew = params.id === 'new';
  const found = useLedger((s) => (isNew ? undefined : s.expenses.find((e) => e.id === params.id)));
  const live = found?.deletedAt === null ? found : undefined;
  // After a delete the modal is still sliding away; keep showing what was there.
  const [last, setLast] = useState(live);
  const [leaving, setLeaving] = useState(false);
  if (live && live !== last) setLast(live);
  const expense = live ?? (leaving ? last : undefined);

  let body: React.ReactNode;
  if (isNew) body = <Editor params={params} />;
  else if (!expense) body = <Missing />;
  else body = <Editor key={expense.id} expense={expense} onLeave={() => setLeaving(true)} />;

  return (
    <Screen>
      {body}
      <Overlays />
    </Screen>
  );
}

function Missing() {
  return (
    <>
      <TopBar modal />
      <EmptyState
        icon="receipt"
        title="This expense isn’t here"
        body="It may have been deleted. Anything removed in the last 30 days is in Trash."
        action={{ label: 'Close', onPress: goBack }}
      />
    </>
  );
}

/** Friends to offer: the given ones first, then everyone else by how recently money moved. */
function pillOrder(people: readonly Person[], entries: readonly Entry[], first: readonly string[]): string[] {
  const recent = lastActivity(entries);
  const seen = (p: Person) => recent.get(p.id) ?? p.createdAt;
  const lead = new Set(first);
  const rest = people
    .filter((p) => p.deletedAt === null && !p.archived && !lead.has(p.id))
    .sort((a, b) => seen(b) - seen(a))
    .map((p) => p.id);
  return [...first, ...rest].slice(0, Math.max(MAX_PILLS, first.length));
}

function initialDraft(
  expense: Expense | undefined,
  params: Params | undefined,
  people: readonly Person[],
  entries: readonly Entry[],
  expenses: readonly Expense[],
  today: DayKey,
): Draft {
  if (expense) {
    const live = new Set(people.filter((p) => p.deletedAt === null).map((p) => p.id));
    const friends = expense.split.map((p) => p.personId).filter((id) => live.has(id));
    return {
      expr: minorToInput(expense.amount),
      title: expense.title,
      cat: expense.category,
      manual: true,
      method: expense.method,
      date: expense.date,
      note: expense.note,
      friends,
      includeMe: expense.share > 0,
      paidBy: expense.paidBy,
      row: pillOrder(people, entries, friends),
      pad: false,
    };
  }
  const p: Params = params ?? { id: 'new' };
  const amount = Number(p.amount);
  const hasAmount = Number.isSafeInteger(amount) && amount > 0 && amount <= LIMITS.amount;
  const preset = people.find((x) => x.id === p.person && x.deletedAt === null);
  const friends = preset ? [preset.id] : [];
  return {
    expr: hasAmount ? minorToInput(amount) : '',
    title: typeof p.title === 'string' ? p.title.slice(0, LIMITS.title) : '',
    cat: isCategory(p.category) ? p.category : null,
    manual: isCategory(p.category),
    method: isMethod(p.method) ? p.method : lastMethod(expenses),
    date: isDayKey(p.day) ? p.day : today,
    note: '',
    friends,
    includeMe: true,
    paidBy: 'me',
    row: pillOrder(people, entries, friends),
    pad: !hasAmount,
  };
}

function Editor({ expense, params, onLeave }: { expense?: Expense; params?: Params; onLeave?: () => void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const money = useMoney();
  const today = useClock((s) => s.today);
  const people = useLedger((s) => s.people);
  const entries = useLedger((s) => s.entries);
  const expenses = useLedger((s) => s.expenses);
  const budget = useSettings((s) => s.budget);
  const keyboard = useKeyboardState((s) => s.isVisible);

  const [init] = useState(() => initialDraft(expense, params, people, entries, expenses, today));
  const [expr, setExpr] = useState(init.expr);
  const [title, setTitle] = useState(init.title);
  const [picked, setPicked] = useState(init.cat);
  const [manual, setManual] = useState(init.manual);
  const [method, setMethod] = useState(init.method);
  const [date, setDate] = useState(init.date);
  const [note, setNote] = useState(init.note);
  const [friends, setFriends] = useState(init.friends);
  const [includeMe, setIncludeMe] = useState(init.includeMe);
  const [paidBy, setPaidBy] = useState(init.paidBy);
  const [row, setRow] = useState(init.row);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [pad, setPad] = useState(init.pad);
  const [dateOpen, setDateOpen] = useState(false);

  const editing = expense !== undefined;
  const amount = evaluate(expr);
  const tooBig = amount !== null && amount > LIMITS.amount;
  const total = amount !== null && !tooBig ? amount : null;

  const guess = manual ? null : guessCategory(title);
  const cat = guess ?? picked;
  const meta = cat ? category(cat) : null;

  const byId = new Map(people.map((p) => [p.id, p]));
  const typed = name.replace(/\s+/g, ' ').trim();
  const typedMatch = typed
    ? people.find((p) => p.deletedAt === null && nameKey(p.name) === nameKey(typed))
    : undefined;
  // A name still in the box counts, so Save never drops someone who wasn't "added" yet.
  const typedKey = adding && typed ? (typedMatch?.id ?? NEW + nameKey(typed)) : null;
  const group = typedKey && !friends.includes(typedKey) ? [...friends, typedKey] : friends;
  const labelFor = (key: string) =>
    key.startsWith(NEW)
      ? (pending[key] ?? (key === typedKey ? typed : 'Someone'))
      : (byId.get(key)?.name ?? 'Someone');

  const payer = paidBy === 'me' || group.includes(paidBy) ? paidBy : 'me';
  // Whoever didn't pay must have a share, or there'd be nothing for me to owe them.
  const meIn = payer !== 'me' || includeMe;
  // Untouched bills keep their stored shares, so odd paise and older splits stay exactly as they were.
  const keep = expense !== undefined && !touched && typedKey === null && total === expense.amount;
  const plan: SplitPlan | null =
    total === null
      ? null
      : keep && expense
        ? { share: expense.share, split: expense.split }
        : planEqualSplit(total, group, meIn);
  const lines: Line[] =
    plan && group.length > 0
      ? [
          ...(meIn ? [{ key: 'me', name: 'You', amount: plan.share }] : []),
          ...plan.split.map((p) => ({ key: p.personId, name: labelFor(p.personId), amount: p.amount })),
        ]
      : [];
  const options: Option[] = group.map((key) => ({ key, name: labelFor(key) }));

  let hint = ' ';
  let hintColor: InkColor = 'ink3';
  if (tooBig) {
    hint = 'That’s more than Daybook can keep track of';
    hintColor = 'negative';
  } else if (group.length > 0) {
    const names = joinNames(group.map((key) => firstName(labelFor(key))));
    if (!plan) {
      hint = `Splitting with ${names}`;
    } else if (payer === 'me') {
      const owed = plan.split.reduce((sum, p) => sum + p.amount, 0);
      if (owed === 0) hint = `Splitting with ${names}`;
      else {
        hint = group.length === 1 ? `${names} owes you ${money(owed)}` : `${names} owe you ${money(owed)} in all`;
        hintColor = 'positive';
      }
    } else {
      hint = `You owe ${firstName(labelFor(payer))} ${money(plan.share)}`;
      hintColor = 'negative';
    }
  } else if (budget > 0) {
    const month = monthOf(date);
    let used = 0;
    for (const e of expenses) {
      if (e.deletedAt === null && e.id !== expense?.id && e.date.startsWith(month)) used += e.share;
    }
    const left = budget - used - (total ?? 0);
    const monthName = MONTHS[Number(month.slice(5, 7)) - 1];
    hint = left >= 0 ? `${money(left)} left of your ${monthName} budget` : `${money(-left)} over your ${monthName} budget`;
    if (left < 0) hintColor = 'warning';
  }

  let adderHint = 'Type a name and press done';
  if (typedKey) {
    if (friends.includes(typedKey)) adderHint = `${labelFor(typedKey)} is already in`;
    else if (typedMatch) adderHint = `Adds ${typedMatch.name}`;
    else adderHint = `Adds ${typed} as a new friend`;
  }

  const openPad = () => {
    Keyboard.dismiss();
    setPad(true);
  };

  const togglePad = () => {
    if (keyboard) openPad();
    else setPad((open) => !open);
  };

  const chooseCategory = (id: CategoryId) => {
    setManual(true);
    setPicked(id);
  };

  const toggleFriend = (key: string) => {
    setTouched(true);
    setFriends((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
  };

  const closeAdder = () => {
    Keyboard.dismiss();
    setAdding(false);
    setName('');
  };

  const addTyped = () => {
    if (!typedKey) {
      closeAdder();
      return;
    }
    const key = typedKey;
    const label = typed;
    if (key.startsWith(NEW)) setPending((map) => ({ ...map, [key]: label }));
    setRow((list) => (list.includes(key) ? list : [key, ...list]));
    setFriends((list) => (list.includes(key) ? list : [...list, key]));
    setTouched(true);
    setName('');
    haptic('select');
  };

  const onNewPill = () => {
    if (!adding) setAdding(true);
    else if (typedKey) addTyped();
    else closeAdder();
  };

  const justMe = () => {
    setTouched(true);
    setFriends([]);
    closeAdder();
  };

  const choosePayer = (key: string) => {
    setTouched(true);
    setPaidBy(key);
  };

  const chooseMeIn = (value: boolean) => {
    setTouched(true);
    setIncludeMe(value);
  };

  const save = () => {
    if (total === null || !plan) return;
    const created: string[] = [];
    const fail = () => {
      const store = useLedger.getState();
      for (const id of created) store.destroyPerson(id);
      toast({ message: 'That didn’t save. Please try again.', icon: 'warning', tone: 'danger' });
    };

    const real = new Map<string, string>();
    for (const key of group) {
      if (!key.startsWith(NEW)) continue;
      const label = labelFor(key);
      const existed = useLedger
        .getState()
        .people.some((p) => p.deletedAt === null && nameKey(p.name) === nameKey(label));
      const person = useLedger.getState().findOrAddPerson(label);
      if (!person) return fail();
      if (!existed) created.push(person.id);
      real.set(key, person.id);
    }
    const resolve = (key: string) => real.get(key) ?? key;
    const split = plan.split.map((p) => ({ personId: resolve(p.personId), amount: p.amount }));
    const saved = useLedger.getState().saveExpense(expense?.id ?? null, {
      title,
      amount: total,
      share: plan.share,
      category: cat ?? 'other',
      method,
      date,
      note,
      paidBy: keep && expense ? expense.paidBy : payer === 'me' ? 'me' : resolve(payer),
      split,
    });
    if (!saved) return fail();

    // Splitting a bill with an archived friend brings them back to the list.
    const before = new Set(expense?.split.map((p) => p.personId));
    for (const part of split) {
      const person = useLedger.getState().people.find((p) => p.id === part.personId);
      if (person?.archived && !before.has(person.id)) useLedger.getState().updatePerson(person.id, { archived: false });
    }

    haptic('success');
    if (expense) {
      toast({ message: 'Expense updated', icon: 'check', tone: 'success' });
      goBack();
      return;
    }
    const owed = saved.amount - saved.share;
    let message = `${money(saved.share)} on ${category(saved.category).label}`;
    if (split.length > 0) {
      message =
        saved.paidBy !== 'me'
          ? `Split · you owe ${firstName(labelFor(payer))} ${money(saved.share)}`
          : owed > 0
            ? `Split · you’re owed ${money(owed)}`
            : 'Bill split';
    }
    toast({
      message,
      icon: category(saved.category).icon,
      tone: 'success',
      action: {
        label: 'Undo',
        onPress: () => {
          const store = useLedger.getState();
          store.destroyExpense(saved.id);
          for (const id of created) store.destroyPerson(id);
        },
      },
    });
    goBack();
  };

  const remove = () => {
    if (!expense) return;
    onLeave?.();
    deleteExpense(expense.id);
    goBack();
  };

  const dateLabel = formatDay(date, today);
  const showPad = pad && !keyboard;
  const amountLabel = group.length > 0 ? 'Total bill' : (meta?.label ?? 'Spent');

  return (
    <>
      <TopBar
        modal
        title={editing ? 'Edit expense' : 'New expense'}
        right={editing ? <IconButton icon="trash" label="Delete expense" onPress={remove} testID="expense-delete" /> : null}
      />
      <KeyboardAwareScrollView
        bottomOffset={DOCK_TYPING}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.flex}
        contentContainerStyle={styles.scroll}>
        <View>
          <Press
            onPress={openPad}
            scale={0.98}
            accessibilityLabel={`${amountLabel}: ${total !== null ? money(total) : 'empty'}`}
            accessibilityHint="Opens the keypad"
            testID="expense-amount">
            <AmountDisplay expr={expr} label={amountLabel} />
          </Press>
          <T variant="callout" color={hintColor} align="center" numberOfLines={2} style={styles.hint} testID="expense-hint">
            {hint}
          </T>
        </View>

        <Field
          value={title}
          onChangeText={setTitle}
          placeholder="What was it for?"
          accessibilityLabel="What it was for"
          maxLength={LIMITS.title}
          returnKeyType="done"
          onFocus={() => setPad(false)}
          testID="expense-title"
          right={
            <Chip
              size="sm"
              icon="calendar-blank"
              label={dateLabel}
              onPress={() => {
                Keyboard.dismiss();
                setDateOpen(true);
              }}
              accessibilityLabel={`Date: ${dateLabel}. Change date`}
              testID="expense-date"
            />
          }
        />

        <View>
          <SectionLabel label="Category" />
          <CategoryPills value={cat} suggested={guess !== null} onChange={chooseCategory} />
        </View>

        <View>
          <SectionLabel label="Paid with" />
          <Segmented options={METHOD_OPTIONS} value={method} onChange={setMethod} testID="expense-method" />
        </View>

        <View>
          <SectionLabel
            label="Split with"
            right={group.length > 0 ? <LinkText label="Just me" onPress={justMe} testID="expense-just-me" /> : null}
          />
          <PillRow>
            {row.map((key) => {
              if (!key.startsWith(NEW)) {
                const p = byId.get(key);
                if (!p || p.deletedAt !== null) return null;
              }
              return (
                <FriendPill
                  key={key}
                  name={labelFor(key)}
                  multiple
                  selected={friends.includes(key) || key === typedKey}
                  onPress={() => toggleFriend(key)}
                  testID={`expense-friend-${key}`}
                />
              );
            })}
            <NewPill
              active={adding}
              onPress={onNewPill}
              label={row.length > 0 ? 'New' : 'Add a friend'}
              testID="expense-new-friend"
            />
          </PillRow>
          {adding ? (
            <Animated.View entering={FadeIn.duration(160)}>
              <Field
                value={name}
                onChangeText={setName}
                placeholder="Their name"
                accessibilityLabel="Friend’s name"
                autoFocus
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={LIMITS.name}
                returnKeyType="done"
                submitBehavior="submit"
                onSubmitEditing={addTyped}
                onFocus={() => setPad(false)}
                hint={adderHint}
                style={styles.adder}
                testID="expense-name"
                right={
                  typed ? (
                    <IconButton
                      icon="plus"
                      label={`Add ${typed}`}
                      onPress={addTyped}
                      size={30}
                      iconSize={14}
                      tone="ink"
                      weight="bold"
                      testID="expense-name-add"
                    />
                  ) : null
                }
              />
            </Animated.View>
          ) : null}
          {group.length > 0 ? (
            <SplitCard
              lines={lines}
              options={options}
              payer={payer}
              meIn={meIn}
              onPayer={choosePayer}
              onMeIn={chooseMeIn}
            />
          ) : null}
        </View>

        <Field
          value={note}
          onChangeText={setNote}
          placeholder="Add a note"
          accessibilityLabel="Note"
          maxLength={LIMITS.note}
          returnKeyType="done"
          onFocus={() => setPad(false)}
          testID="expense-note"
        />
      </KeyboardAwareScrollView>

      <KeyboardStickyView
        offset={{ closed: 0, opened: insets.bottom }}
        style={[styles.dock, { backgroundColor: c.bg, paddingBottom: insets.bottom + space.md }]}>
        {showPad ? (
          <Animated.View entering={FadeIn.duration(180)}>
            <AmountPad onKey={(key) => setExpr((e) => pressKey(e, key))} />
          </Animated.View>
        ) : null}
        <View style={styles.dockRow}>
          <IconButton
            icon={showPad ? 'caret-down' : 'calculator'}
            label={showPad ? 'Hide keypad' : 'Show keypad'}
            onPress={togglePad}
            size={56}
            iconSize={22}
            tone="surface"
            testID="expense-pad"
          />
          <View style={styles.flex}>
            <Button
              label={editing ? 'Save changes' : 'Save'}
              variant="ink"
              size="lg"
              full
              disabled={total === null}
              onPress={save}
              testID="expense-save"
            />
          </View>
        </View>
      </KeyboardStickyView>

      <DateSheet
        visible={dateOpen}
        onClose={() => setDateOpen(false)}
        value={date}
        onChange={(d) => {
          if (d) setDate(d);
        }}
        title="When was this?"
        past
      />
    </>
  );
}

function CategoryPills({
  value,
  suggested,
  onChange,
}: {
  value: CategoryId | null;
  suggested: boolean;
  onChange: (id: CategoryId) => void;
}) {
  const c = useTheme();
  const dark = c.scheme === 'dark' ? 1 : 0;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const offsets = useRef<Partial<Record<CategoryId, number>>>({});
  const placed = useRef(false);

  // Follow the guess while the title is typed, so the chosen category never hides off-screen.
  useEffect(() => {
    const x = value ? offsets.current[value] : undefined;
    if (x !== undefined) scroll.current?.scrollTo({ x: Math.max(0, x - PEEK), animated: true });
  }, [value]);

  return (
    <PillRow ref={scroll} testID="expense-categories">
      {CATEGORIES.map((item) => {
        const color = item.color[dark];
        const selected = item.id === value;
        return (
          <Press
            key={item.id}
            onPress={() => onChange(item.id)}
            onLayout={(e) => {
              const x = e.nativeEvent.layout.x;
              offsets.current[item.id] = x;
              if (selected && !placed.current) {
                placed.current = true;
                scroll.current?.scrollTo({ x: Math.max(0, x - PEEK), animated: false });
              }
            }}
            haptic="select"
            scale={0.95}
            aria-selected={selected}
            accessibilityLabel={selected && suggested ? `${item.label}, suggested` : item.label}
            testID={`expense-cat-${item.id}`}
            style={[
              styles.cat,
              { backgroundColor: selected ? `${color}24` : c.surface, borderColor: selected ? color : c.line },
            ]}>
            <View style={[styles.catIcon, { backgroundColor: selected ? color : `${color}24` }]}>
              <Icon name={item.icon} size={14} color={selected ? c.bg : color} weight="bold" />
            </View>
            <T variant="calloutMedium" color={selected ? 'ink' : 'ink2'}>
              {item.label}
            </T>
            {selected && suggested ? <Icon name="sparkle" size={12} color={color} weight="fill" /> : null}
          </Press>
        );
      })}
    </PillRow>
  );
}

function SplitCard({
  lines,
  options,
  payer,
  meIn,
  onPayer,
  onMeIn,
}: {
  lines: Line[];
  options: Option[];
  payer: string;
  meIn: boolean;
  onPayer: (key: string) => void;
  onMeIn: (value: boolean) => void;
}) {
  const c = useTheme();
  const money = useMoney();
  const me = useSettings((s) => s.name).trim() || 'Me';
  const payerFirst = firstName(options.find((o) => o.key === payer)?.name ?? 'They');
  const even = lines.length > 1 && lines.every((l) => l.amount === lines[0].amount);

  let meDetail = meIn ? 'You pay your part too' : 'You covered it just for them';
  if (payer !== 'me') meDetail = `${payerFirst} paid, so your part is what you owe`;

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}
      testID="expense-split">
      <View style={styles.section}>
        <T variant="label" color="ink3">
          Who paid
        </T>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.cardBleed}
          contentContainerStyle={styles.payers}>
          <Chip label="You" selected={payer === 'me'} onPress={() => onPayer('me')} testID="expense-payer-me" />
          {options.map((o) => (
            <Chip
              key={o.key}
              label={firstName(o.name)}
              selected={payer === o.key}
              onPress={() => onPayer(o.key)}
              testID={`expense-payer-${o.key}`}
            />
          ))}
        </ScrollView>
      </View>
      <Hairline />
      <View style={[styles.section, styles.meRow]}>
        <View style={styles.flex}>
          <T variant="bodyMedium">Count me in</T>
          <T variant="small" color="ink3">
            {meDetail}
          </T>
        </View>
        <Toggle value={meIn} onChange={onMeIn} label="Count me in" disabled={payer !== 'me'} testID="expense-me-in" />
      </View>
      <Hairline />
      <View style={styles.section}>
        <View style={styles.sharesHead}>
          <T variant="label" color="ink3">
            Shares
          </T>
          {even ? (
            <T variant="small" color="ink3">
              {`${money(lines[0].amount)} each`}
            </T>
          ) : null}
        </View>
        {lines.length === 0 ? (
          <T variant="callout" color="ink3">
            Type the total to see everyone’s share
          </T>
        ) : (
          lines.map((line) => {
            const mine = line.key === 'me';
            let status: string;
            let tone: InkColor = 'ink3';
            if (mine) {
              status = payer === 'me' ? 'your part' : `you owe ${payerFirst}`;
              if (payer !== 'me') tone = 'negative';
            } else if (payer === 'me') {
              status = line.amount > 0 ? 'owes you' : 'nothing to pay';
              if (line.amount > 0) tone = 'positive';
            } else if (line.key === payer) {
              status = 'paid the bill';
            } else {
              status = `pays ${payerFirst}`;
            }
            return (
              <View key={line.key} style={styles.line}>
                <Avatar name={mine ? me : line.name} size={30} />
                <View style={styles.flex}>
                  <T variant="calloutMedium" numberOfLines={1}>
                    {mine ? 'You' : line.name}
                  </T>
                  <T variant="small" color={tone}>
                    {status}
                  </T>
                </View>
                <T variant="amount">{money(line.amount)}</T>
              </View>
            );
          })
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: space.page, paddingTop: space.sm, paddingBottom: space.xl, gap: space.xl },
  hint: { marginTop: space.xs, minHeight: 22, paddingHorizontal: space.lg },
  cat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 40,
    paddingLeft: 7,
    paddingRight: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  catIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  adder: { marginTop: space.md },
  card: { marginTop: space.md, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  section: { padding: space.lg, gap: space.md },
  cardBleed: { marginHorizontal: -space.lg },
  payers: { paddingHorizontal: space.lg, gap: space.sm },
  meRow: { flexDirection: 'row', alignItems: 'center' },
  sharesHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dock: { paddingHorizontal: space.page, paddingTop: space.md, gap: space.md },
  dockRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
