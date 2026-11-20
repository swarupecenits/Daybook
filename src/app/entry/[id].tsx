import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView, useKeyboardState } from 'react-native-keyboard-controller';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmountDisplay, AmountPad } from '@/components/amount-pad';
import { Avatar } from '@/components/avatar';
import { Button, IconButton } from '@/components/button';
import { Chip, Segmented } from '@/components/chip';
import { DateSheet } from '@/components/date-sheet';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/form';
import { FriendPill, NewPill, PillRow } from '@/components/friend-pill';
import { Screen, SectionLabel, TopBar } from '@/components/layout';
import { Overlays } from '@/components/overlays';
import { T } from '@/components/text';
import { balances, lastActivity, signed, standing } from '@/lib/balances';
import { evaluate, minorToInput, pressKey } from '@/lib/calc';
import { formatDay, isDayKey } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { LIMITS } from '@/lib/limits';
import { goBack } from '@/lib/system';
import { firstName } from '@/lib/text';
import type { DayKey, Entry, EntryKind, Person } from '@/lib/types';
import { deleteEntry } from '@/stores/actions';
import { useClock } from '@/stores/clock';
import { useLedger } from '@/stores/ledger';
import { toast } from '@/stores/toast';
import { space, useMoney, useTheme } from '@/theme';

const MAX_PILLS = 24;
/** Room for the save dock between a focused field and the keyboard. */
const DOCK_TYPING = 96;
const KINDS: readonly { value: EntryKind; label: string }[] = [
  { value: 'gave', label: 'I gave' },
  { value: 'got', label: 'I got' },
];

type Params = {
  id: string;
  person?: string;
  kind?: string;
  amount?: string;
  note?: string;
  day?: string;
  name?: string;
};

type Draft = {
  kind: EntryKind;
  expr: string;
  note: string;
  date: DayKey;
  personId: string | null;
  adding: boolean;
  name: string;
  order: string[];
};

const nameKey = (name: string) => name.replace(/\s+/g, ' ').trim().toLocaleLowerCase();

export default function EntryScreen() {
  const params = useLocalSearchParams<Params>();
  const isNew = params.id === 'new';
  const found = useLedger((s) => (isNew ? undefined : s.entries.find((e) => e.id === params.id)));
  const live = found?.deletedAt === null ? found : undefined;
  // After a delete the modal is still sliding away; keep showing what was there.
  const [last, setLast] = useState(live);
  const [leaving, setLeaving] = useState(false);
  if (live && live !== last) setLast(live);
  const entry = live ?? (leaving ? last : undefined);

  let body: React.ReactNode;
  if (isNew) body = <Editor params={params} />;
  else if (!entry) body = <Missing />;
  else if (entry.expenseId) body = <FromExpense entry={entry} />;
  else body = <Editor key={entry.id} entry={entry} onLeave={() => setLeaving(true)} />;

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
        icon="tray"
        title="This entry isn’t here"
        body="It may have been deleted. Anything removed in the last 30 days is in Trash."
        action={{ label: 'Close', onPress: goBack }}
      />
    </>
  );
}

/** Entries made by a split bill are edited through the bill, so their totals can't drift apart. */
function FromExpense({ entry }: { entry: Entry }) {
  const expense = useLedger((s) => s.expenses.find((e) => e.id === entry.expenseId && e.deletedAt === null));
  const open = () => {
    if (expense) router.replace({ pathname: '/expense/[id]', params: { id: expense.id } });
  };
  return (
    <>
      <TopBar modal />
      <EmptyState
        icon="receipt"
        title="Part of a split bill"
        body={`This share comes from “${expense?.title ?? entry.note}”. Change the bill and every share updates with it.`}
        action={expense ? { label: 'Open the bill', onPress: open, icon: 'arrow-right' } : { label: 'Close', onPress: goBack }}
      />
    </>
  );
}

function initialDraft(
  entry: Entry | undefined,
  params: Params | undefined,
  people: readonly Person[],
  entries: readonly Entry[],
  today: DayKey,
): Draft {
  if (entry) {
    return {
      kind: entry.kind,
      expr: minorToInput(entry.amount),
      note: entry.note,
      date: entry.date,
      personId: entry.personId,
      adding: false,
      name: '',
      order: [],
    };
  }
  const p: Params = params ?? { id: 'new' };
  const live = people.filter((x) => x.deletedAt === null);
  const wanted = typeof p.name === 'string' ? nameKey(p.name) : '';
  const preset =
    live.find((x) => x.id === p.person) ?? (wanted ? live.find((x) => x.name.toLocaleLowerCase() === wanted) : undefined);
  const recent = lastActivity(entries);
  const seen = (x: Person) => recent.get(x.id) ?? x.createdAt;
  const order = live
    .filter((x) => !x.archived && x.id !== preset?.id)
    .sort((a, b) => seen(b) - seen(a))
    .map((x) => x.id);
  if (preset) order.unshift(preset.id);
  const amount = Number(p.amount);
  return {
    kind: p.kind === 'got' ? 'got' : 'gave',
    expr: Number.isSafeInteger(amount) && amount > 0 && amount <= LIMITS.amount ? minorToInput(amount) : '',
    note: typeof p.note === 'string' ? p.note.slice(0, LIMITS.note) : '',
    date: isDayKey(p.day) ? p.day : today,
    personId: preset?.id ?? null,
    adding: !preset && (order.length === 0 || wanted !== ''),
    name: !preset && typeof p.name === 'string' ? p.name.slice(0, LIMITS.name) : '',
    order: order.slice(0, MAX_PILLS),
  };
}

function Editor({ entry, params, onLeave }: { entry?: Entry; params?: Params; onLeave?: () => void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const money = useMoney();
  const today = useClock((s) => s.today);
  const people = useLedger((s) => s.people);
  const entries = useLedger((s) => s.entries);
  const keyboard = useKeyboardState((s) => s.isVisible);

  const [init] = useState(() => initialDraft(entry, params, people, entries, today));
  const [kind, setKind] = useState(init.kind);
  const [expr, setExpr] = useState(init.expr);
  const [note, setNote] = useState(init.note);
  const [date, setDate] = useState(init.date);
  const [personId, setPersonId] = useState(init.personId);
  const [adding, setAdding] = useState(init.adding);
  const [name, setName] = useState(init.name);
  const [focusName, setFocusName] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  const editing = entry !== undefined;
  const amount = evaluate(expr);
  const tooBig = amount !== null && amount > LIMITS.amount;
  const typed = name.replace(/\s+/g, ' ').trim();
  const match = adding && typed ? people.find((p) => p.deletedAt === null && p.name.toLocaleLowerCase() === nameKey(typed)) : undefined;
  const person = adding ? match : people.find((p) => p.id === personId && p.deletedAt === null);
  const who = person?.name ?? (adding ? typed : '');
  const first = who ? firstName(who) : '';
  const own = entry && entry.deletedAt === null && person?.id === entry.personId ? signed(entry) : 0;
  const before = person ? (balances(entries).get(person.id) ?? 0) - own : 0;
  const after = amount !== null && !tooBig ? before + signed({ kind, amount }) : null;
  const canSave = amount !== null && !tooBig && (editing || (adding ? typed.length > 0 : person !== undefined));

  let hint = ' ';
  let hintColor: 'ink2' | 'ink3' | 'positive' | 'negative' = 'ink3';
  if (tooBig) {
    hint = 'That’s more than Daybook can keep track of';
    hintColor = 'negative';
  } else if (!who) {
    hint = adding ? 'Add their name below' : 'Who’s it with?';
  } else if (after === null) {
    hint = person ? standing(first, before, money) : `Your first entry with ${first}`;
  } else {
    hint = `After this, ${standing(first, after, money, false)}`;
    hintColor = after > 0 ? 'positive' : after < 0 ? 'negative' : 'ink2';
  }

  const byId = new Map(people.map((p) => [p.id, p]));

  const pick = (id: string) => {
    setAdding(false);
    setPersonId(id);
  };

  const startAdding = () => {
    setPersonId(null);
    setAdding(true);
    setFocusName(true);
  };

  const save = () => {
    if (amount === null || tooBig) return;
    const store = useLedger.getState();
    const clean = note.trim();
    if (entry) {
      store.updateEntry(entry.id, { kind, amount, note: clean, date });
      haptic('success');
      toast({ message: 'Entry updated', icon: 'check', tone: 'success' });
      goBack();
      return;
    }
    const existed = !adding || match !== undefined;
    const target = adding ? (store.findOrAddPerson(typed) ?? undefined) : person;
    const saved = target ? store.addEntry({ personId: target.id, kind, amount, note: clean, date }) : null;
    if (!target || !saved) {
      toast({ message: 'That didn’t save. Please try again.', icon: 'warning', tone: 'danger' });
      return;
    }
    const pid = target.id;
    const fresh = !existed;
    const balance = balances(useLedger.getState().entries).get(pid) ?? 0;
    haptic('success');
    toast({
      message: standing(firstName(target.name), balance, money),
      icon: kind === 'gave' ? 'arrow-up-right' : 'arrow-down-left',
      tone: 'success',
      action: {
        label: 'Undo',
        onPress: () => {
          if (fresh) useLedger.getState().destroyPerson(pid);
          else useLedger.getState().destroyEntry(saved.id);
        },
      },
    });
    goBack();
  };

  const remove = () => {
    if (!entry) return;
    onLeave?.();
    deleteEntry(entry.id);
    goBack();
  };

  const dateLabel = formatDay(date, today);

  return (
    <>
      <TopBar
        modal
        title={editing ? 'Edit entry' : 'Record money'}
        right={editing ? <IconButton icon="trash" label="Delete entry" onPress={remove} testID="entry-delete" /> : null}
      />
      <KeyboardAwareScrollView
        bottomOffset={DOCK_TYPING}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.flex}
        contentContainerStyle={styles.scroll}>
        <Segmented options={KINDS} value={kind} onChange={setKind} testID="entry-kind" />

        <View>
          <AmountDisplay
            expr={expr}
            color={kind === 'got' ? c.positive : c.ink}
            label={first ? (kind === 'gave' ? `To ${first}` : `From ${first}`) : undefined}
          />
          <T variant="callout" color={hintColor} align="center" numberOfLines={2} style={styles.hint} testID="entry-hint">
            {hint}
          </T>
        </View>

        {editing ? (
          person ? (
            <View style={styles.fixed}>
              <Avatar name={person.name} size={28} />
              <T variant="calloutMedium" numberOfLines={1}>
                {person.name}
              </T>
            </View>
          ) : null
        ) : (
          <View>
            <SectionLabel label="With" />
            <PillRow>
              {init.order.map((id) => {
                const p = byId.get(id);
                if (!p || p.deletedAt !== null) return null;
                return (
                  <FriendPill
                    key={id}
                    name={p.name}
                    selected={!adding && personId === id}
                    onPress={() => pick(id)}
                    testID={`entry-friend-${id}`}
                  />
                );
              })}
              <NewPill active={adding} onPress={startAdding} testID="entry-new-friend" />
            </PillRow>
            {adding ? (
              <Animated.View entering={FadeIn.duration(160)}>
                <Field
                  value={name}
                  onChangeText={setName}
                  placeholder="Their name"
                  accessibilityLabel="Friend’s name"
                  autoFocus={focusName}
                  autoCapitalize="words"
                  autoCorrect={false}
                  maxLength={LIMITS.name}
                  returnKeyType="done"
                  hint={typed ? (match ? `Adds to ${match.name}’s balance` : `Adds ${typed} to your friends`) : undefined}
                  style={styles.nameField}
                  testID="entry-name"
                />
              </Animated.View>
            ) : null}
          </View>
        )}

        <Field
          value={note}
          onChangeText={setNote}
          placeholder="What was it for?"
          accessibilityLabel="Note"
          maxLength={LIMITS.note}
          returnKeyType="done"
          testID="entry-note"
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
              testID="entry-date"
            />
          }
        />
      </KeyboardAwareScrollView>

      <KeyboardStickyView
        offset={{ closed: 0, opened: insets.bottom }}
        style={[styles.dock, { backgroundColor: c.bg, paddingBottom: insets.bottom + space.md }]}>
        {keyboard ? null : (
          <Animated.View entering={FadeIn.duration(180)}>
            <AmountPad onKey={(key) => setExpr((e) => pressKey(e, key))} />
          </Animated.View>
        )}
        <Button
          label={editing ? 'Save changes' : 'Save'}
          variant="ink"
          size="lg"
          full
          disabled={!canSave}
          onPress={save}
          testID="entry-save"
        />
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: space.page, paddingTop: space.sm, paddingBottom: space.xl, gap: space.xl },
  hint: { marginTop: space.xs, minHeight: 22, paddingHorizontal: space.lg },
  fixed: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 10, maxWidth: '100%' },

  nameField: { marginTop: space.md },
  dock: { paddingHorizontal: space.page, paddingTop: space.md, gap: space.md },
});
