import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BudgetSheet } from '@/components/budget-sheet';
import { Chip, Segmented } from '@/components/chip';
import { BrandMark, Wordmark } from '@/components/empty-state';
import { Field, Group, Row, Toggle } from '@/components/form';
import { Icon, type IconName } from '@/components/icon';
import { Hairline, Screen, TopBar } from '@/components/layout';
import { Press } from '@/components/press';
import { Sheet } from '@/components/sheet';
import { T } from '@/components/text';
import { authenticate, type LockSupport, lockSupport } from '@/lib/auth';
import { countRecords } from '@/lib/backup';
import { relativeTime } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { LIMITS } from '@/lib/limits';
import { CURRENCIES, currencyInfo } from '@/lib/money';
import { isBlank } from '@/lib/notes';
import { ensureReminderPermission } from '@/lib/reminders';
import { LOCK_GRACE_OPTIONS } from '@/lib/settings';
import { confirm } from '@/lib/system';
import { trashItems } from '@/lib/trash';
import type { Settings } from '@/lib/types';
import { isVpa } from '@/lib/upi';
import { eraseEverything, exportBackup, mergeBackup, pickBackup } from '@/stores/backup';
import { useClock } from '@/stores/clock';
import { useLedger } from '@/stores/ledger';
import { useLogs } from '@/stores/logs';
import { useNotes } from '@/stores/notes';
import { useSettings } from '@/stores/settings';
import { useTasks } from '@/stores/tasks';
import { toast } from '@/stores/toast';
import { radius, space, useMoney, useTheme } from '@/theme';

const NATIVE = Platform.OS !== 'web';

const THEMES: readonly { value: Settings['theme']; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const WEEK_STARTS = [
  { value: '1', label: 'Monday' },
  { value: '0', label: 'Sunday' },
] as const;

const GRACE_LABEL: Record<(typeof LOCK_GRACE_OPTIONS)[number], string> = { 0: 'At once', 60: 'After 1 min', 300: 'After 5 min' };
const GRACES = LOCK_GRACE_OPTIONS.map((g) => ({ value: String(g), label: GRACE_LABEL[g] }));

const save = (patch: Partial<Settings>) => useSettings.getState().update(patch);

type Busy = 'export' | 'import' | 'erase' | 'lock' | null;

export default function SettingsScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const money = useMoney();
  const at = useClock((s) => s.at);
  const s = useSettings();
  const notes = useNotes((st) => st.notes);
  const tasks = useTasks((st) => st.tasks);
  const logs = useLogs((st) => st.logs);
  const people = useLedger((st) => st.people);
  const entries = useLedger((st) => st.entries);
  const expenses = useLedger((st) => st.expenses);

  const [name, setName] = useState(s.name);
  const [upi, setUpi] = useState(s.upi);
  const [upiError, setUpiError] = useState<string | null>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [support, setSupport] = useState<LockSupport | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  // What's typed but not yet saved, so leaving the screen mid-edit keeps it.
  const draft = useRef({ name: s.name, upi: s.upi });

  useEffect(() => {
    let live = true;
    void lockSupport().then((found) => {
      if (live) setSupport(found);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(
    () => () => {
      const { name: n, upi: u } = draft.current;
      const patch: Partial<Settings> = { name: n.trim() };
      if (!u.trim() || isVpa(u)) patch.upi = u.trim();
      save(patch);
    },
    [],
  );

  const data = { notes, tasks, logs, people, entries, expenses };
  const inTrash = trashItems(data, at).length;
  const liveNotes = notes.filter((n) => n.deletedAt === null && !isBlank(n)).length;
  const liveTasks = tasks.filter((t) => t.deletedAt === null).length;
  const liveFriends = people.filter((p) => p.deletedAt === null).length;
  const liveExpenses = expenses.filter((x) => x.deletedAt === null).length;
  const hasMoney = people.length + entries.length + expenses.length > 0 || s.budget > 0;
  const info = currencyInfo(s.currency);
  const showUpi = s.currency === 'INR' || !!s.upi;

  const commitName = () => {
    if (name.trim() !== s.name) save({ name: name.trim() });
  };

  const commitUpi = () => {
    const value = upi.trim();
    if (value && !isVpa(value)) {
      setUpiError('That doesn’t look like a UPI ID. It should be like name@bank.');
      return;
    }
    setUpiError(null);
    if (value !== s.upi) save({ upi: value });
  };

  const pickCurrency = async (code: string) => {
    if (code === s.currency) {
      setCurrencyOpen(false);
      return;
    }
    const next = currencyInfo(code);
    if (hasMoney) {
      const sure = await confirm({
        title: `Switch to ${next.name}?`,
        message: `Amounts already in Daybook keep their numbers and aren’t converted: ${money(50000)} will show as ${next.symbol.trim()}500.`,
        confirm: 'Switch',
      });
      if (!sure) return;
    }
    if (save({ currency: code })) haptic('success');
    setCurrencyOpen(false);
  };

  const toggleRemind = async (next: boolean) => {
    if (next && !(await ensureReminderPermission())) {
      toast({ message: 'Notifications are off for Daybook. You can allow them in your phone’s settings.', icon: 'bell-slash' });
      return;
    }
    save({ remindByDefault: next });
  };

  const toggleLock = async (next: boolean) => {
    if (busy) return;
    if (next && !support?.available) {
      toast({ message: 'Set up a passcode or biometrics on this phone first.', icon: 'lock' });
      return;
    }
    setBusy('lock');
    try {
      const result = await authenticate(next ? 'Turn on app lock' : 'Turn off app lock');
      // With no way left to unlock, the lock can only be switched off.
      if (result === 'ok' || (!next && result === 'unavailable')) {
        if (save({ lock: next })) haptic('success');
      } else if (result === 'unavailable') {
        toast({ message: `${support?.label ?? 'Screen lock'} isn’t available right now.`, tone: 'danger', icon: 'warning' });
      } else if (result === 'failed') {
        toast({ message: 'Couldn’t confirm it’s you.', tone: 'danger', icon: 'warning' });
      }
    } finally {
      setBusy(null);
    }
  };

  const runExport = async () => {
    if (busy) return;
    setBusy('export');
    try {
      const result = await exportBackup();
      if (result === 'downloaded') toast({ message: 'Backup downloaded', tone: 'success', icon: 'download-simple' });
      else if (result === 'unavailable') toast({ message: 'Sharing isn’t available on this device.', tone: 'danger', icon: 'warning' });
    } catch {
      toast({ message: 'Couldn’t create the backup.', tone: 'danger', icon: 'warning' });
    } finally {
      setBusy(null);
    }
  };

  const runImport = async () => {
    if (busy) return;
    setBusy('import');
    try {
      const parsed = await pickBackup();
      if (!parsed) return;
      if (!parsed.ok) {
        toast({ message: parsed.error, tone: 'danger', icon: 'warning' });
        return;
      }
      const n = countRecords(parsed.data);
      const sure = await confirm({
        title: 'Merge this backup?',
        message: `${n} ${n === 1 ? 'record' : 'records'}, saved ${relativeTime(parsed.exportedAt)}. Where both have the same item, the newer edit wins. Nothing on this phone is deleted.`,
        confirm: 'Merge',
      });
      if (!sure) return;
      const summary = mergeBackup(parsed);
      if (!summary) return;
      haptic('success');
      const parts = [
        summary.added ? `${summary.added} added` : null,
        summary.updated ? `${summary.updated} updated` : null,
        summary.skipped ? `${summary.skipped} skipped` : null,
      ].filter(Boolean);
      toast({
        message: parts.length ? `Backup merged · ${parts.join(' · ')}` : 'Already up to date',
        tone: 'success',
        icon: 'download-simple',
      });
    } catch {
      toast({ message: 'Couldn’t open that file.', tone: 'danger', icon: 'warning' });
    } finally {
      setBusy(null);
    }
  };

  const runErase = async () => {
    if (busy) return;
    const sure = await confirm({
      title: 'Erase everything?',
      message:
        'Every note, task, log entry, friend and expense on this phone will be deleted, along with your settings. Export a backup first if you might want them back.',
      confirm: 'Erase everything',
      destructive: true,
    });
    if (!sure) return;
    setBusy('erase');
    try {
      if (s.lock && (await authenticate('Confirm to erase Daybook')) !== 'ok') return;
      if (await eraseEverything()) {
        haptic('heavy');
        toast({ message: 'Daybook erased. Fresh start.', icon: 'sparkle' });
      }
    } finally {
      setBusy(null);
    }
  };

  const counts = [
    `${liveNotes} ${liveNotes === 1 ? 'note' : 'notes'}`,
    `${liveTasks} ${liveTasks === 1 ? 'task' : 'tasks'}`,
    `${liveFriends} ${liveFriends === 1 ? 'friend' : 'friends'}`,
    `${liveExpenses} ${liveExpenses === 1 ? 'expense' : 'expenses'}`,
  ].join(' · ');

  return (
    <Screen>
      <TopBar />
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.xxl * 2 }]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={32}
        showsVerticalScrollIndicator={false}
        testID="settings-scroll">
        <View style={styles.hero}>
          <T variant="display" accessibilityRole="header">
            Settings
          </T>
          <T variant="italic" color="ink2">
            Yours alone. Everything here stays on this phone.
          </T>
        </View>

        <Group label="You">
          <View style={styles.fields}>
            <Field
              label="Name"
              placeholder="Your first name"
              value={name}
              onChangeText={(v) => {
                setName(v);
                draft.current.name = v;
              }}
              onBlur={commitName}
              onSubmitEditing={commitName}
              autoCapitalize="words"
              autoComplete="given-name"
              textContentType="givenName"
              maxLength={LIMITS.name}
              returnKeyType="done"
              hint="For greetings, and to sign the payment reminders you send."
              testID="settings-name"
            />
            {showUpi ? (
              <Field
                label="Your UPI ID"
                placeholder="name@bank"
                value={upi}
                onChangeText={(v) => {
                  setUpi(v);
                  draft.current.upi = v;
                  if (upiError && (!v.trim() || isVpa(v))) setUpiError(null);
                }}
                onBlur={commitUpi}
                onSubmitEditing={commitUpi}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                maxLength={LIMITS.upi}
                returnKeyType="done"
                error={upiError}
                hint="Added to reminders so friends can pay you in one tap."
                testID="settings-upi"
              />
            ) : null}
          </View>
        </Group>

        <Group label="Money">
          <Row
            icon="coins"
            label="Currency"
            value={`${info.symbol.trim()} ${info.code}`}
            chevron
            onPress={() => setCurrencyOpen(true)}
            testID="settings-currency"
          />
          <Row
            icon="target"
            label="Monthly budget"
            value={s.budget ? money(s.budget, { compact: true }) : 'Not set'}
            chevron
            onPress={() => setBudgetOpen(true)}
            testID="settings-budget"
          />
        </Group>

        <Group label="Appearance">
          <Choice icon="circle-half" label="Theme" options={THEMES} value={s.theme} onChange={(theme) => save({ theme })} testID="settings-theme" />
          <Choice
            icon="calendar-dots"
            label="Week starts on"
            options={WEEK_STARTS}
            value={String(s.weekStart) as '0' | '1'}
            onChange={(v) => save({ weekStart: v === '0' ? 0 : 1 })}
            testID="settings-week"
          />
          {NATIVE ? (
            <Row
              icon="lightning"
              label="Haptics"
              detail="Small taps under your thumb as you work."
              right={<Toggle label="Haptics" value={s.haptics} onChange={(haptics) => save({ haptics })} testID="settings-haptics" />}
            />
          ) : null}
        </Group>

        {NATIVE ? (
          <Group label="Tasks">
            <Row
              icon="bell"
              label="Remind me by default"
              detail="Tasks with a date get a notification unless you turn it off."
              right={
                <Toggle
                  label="Remind me by default"
                  value={s.remindByDefault}
                  onChange={(v) => void toggleRemind(v)}
                  testID="settings-remind"
                />
              }
            />
          </Group>
        ) : null}

        {NATIVE ? (
          <Group label="Privacy & security">
            <Row
              icon={support?.icon ?? 'lock'}
              label={`Lock with ${support?.label ?? 'screen lock'}`}
              detail={
                support && !support.available && !s.lock
                  ? 'Set up a passcode or biometrics on this phone to use this.'
                  : 'Daybook asks for it whenever you come back.'
              }
              right={
                <Toggle
                  label="App lock"
                  value={s.lock}
                  onChange={(v) => void toggleLock(v)}
                  disabled={busy === 'lock' || (!s.lock && support !== null && !support.available)}
                  testID="settings-lock"
                />
              }
            />
            {s.lock ? (
              <Choice
                icon="clock"
                label="Lock"
                options={GRACES}
                value={String(s.lockGrace)}
                onChange={(v) => save({ lockGrace: Number(v) as Settings['lockGrace'] })}
                testID="settings-grace"
              />
            ) : null}
            <Row
              icon="eye-slash"
              label="Privacy screen"
              detail={
                Platform.OS === 'ios'
                  ? 'Blurs Daybook in the app switcher.'
                  : 'Hides Daybook in recent apps and blocks screenshots.'
              }
              right={<Toggle label="Privacy screen" value={s.privacy} onChange={(privacy) => save({ privacy })} testID="settings-privacy" />}
            />
          </Group>
        ) : null}

        <Group label="Your data" footer={`${counts}. Backups are plain JSON files, so keep them somewhere private.`}>
          <Row
            icon="export"
            label="Export a backup"
            detail="Save everything to Files, Drive or anywhere you like."
            onPress={() => void runExport()}
            disabled={busy !== null}
            chevron
            testID="settings-export"
          />
          <Row
            icon="download-simple"
            label="Import a backup"
            detail="Merges with what’s here. Newer edits win."
            onPress={() => void runImport()}
            disabled={busy !== null}
            chevron
            testID="settings-import"
          />
          <Row
            icon="trash"
            label="Trash"
            value={inTrash ? String(inTrash) : 'Empty'}
            onPress={() => router.push('/trash')}
            chevron
            testID="settings-trash"
          />
          <Row
            icon="warning"
            label="Erase everything"
            detail="Deletes all your data from this phone."
            onPress={() => void runErase()}
            disabled={busy !== null}
            danger
            testID="settings-erase"
          />
        </Group>

        <View style={[styles.about, { backgroundColor: c.surface, borderColor: c.line }]}>
          <BrandMark size={52} />
          <View style={styles.aboutText}>
            <Wordmark size={26} />
            <T variant="label" color="ink3">
              {`Version ${Constants.expoConfig?.version ?? '1.0.0'}`}
            </T>
          </View>
          <View style={styles.promises}>
            {['No account', 'No ads', 'No tracking', 'Works offline'].map((p) => (
              <Chip key={p} label={p} size="sm" tone="positive" icon="check" />
            ))}
          </View>
          <T variant="italic" color="ink3" align="center">
            Made for the small things in a day.
          </T>
        </View>
      </KeyboardAwareScrollView>

      <Sheet visible={currencyOpen} onClose={() => setCurrencyOpen(false)} title="Currency" testID="currency-sheet">
        <View style={[styles.currencies, { borderColor: c.line, backgroundColor: c.surface }]}>
          {CURRENCIES.map((cur, i) => {
            const on = cur.code === s.currency;
            return (
              <View key={cur.code}>
                {i > 0 ? <Hairline inset={64} /> : null}
                <Press
                  onPress={() => void pickCurrency(cur.code)}
                  scale={0.985}
                  haptic="select"
                  style={styles.currency}
                  accessibilityRole="radio"
                  aria-checked={on}
                  accessibilityLabel={cur.name}
                  testID={`settings-currency-${cur.code}`}>
                  <View style={[styles.symbol, { backgroundColor: on ? c.ink : c.surface2 }]}>
                    {/* Web ignores adjustsFontSizeToFit, so long symbols like "AED" step down a size. */}
                    <T
                      variant={cur.symbol.trim().length > 2 ? 'caption' : 'calloutMedium'}
                      color={on ? 'bg' : 'ink'}
                      numberOfLines={1}
                      adjustsFontSizeToFit>
                      {cur.symbol.trim()}
                    </T>
                  </View>
                  <View style={styles.flex}>
                    <T variant="bodyMedium">{cur.name}</T>
                    <T variant="label" color="ink3">
                      {cur.code}
                    </T>
                  </View>
                  {on ? <Icon name="check" size={18} color={c.accent} weight="bold" /> : null}
                </Press>
              </View>
            );
          })}
        </View>
      </Sheet>
      <BudgetSheet visible={budgetOpen} onClose={() => setBudgetOpen(false)} />
    </Screen>
  );
}

type ChoiceProps<V extends string> = {
  icon: IconName;
  label: string;
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
  testID?: string;
};

/** A settings row whose answer is one of a few options. */
function Choice<V extends string>({ icon, label, options, value, onChange, testID }: ChoiceProps<V>) {
  const c = useTheme();
  return (
    <View style={styles.choice}>
      <View style={styles.choiceHead}>
        <View style={[styles.tile, { backgroundColor: c.surface2 }]}>
          <Icon name={icon} size={18} color={c.ink} weight="bold" />
        </View>
        <T variant="bodyMedium">{label}</T>
      </View>
      <Segmented options={options} value={value} onChange={onChange} testID={testID} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: space.page, gap: space.xl },
  hero: { gap: space.xs, paddingHorizontal: 4, marginBottom: -space.xs },
  fields: { padding: space.lg, gap: space.lg },
  choice: { paddingHorizontal: space.lg, paddingVertical: 12, gap: space.md },
  choiceHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  about: {
    alignItems: 'center',
    gap: space.md,
    padding: space.xl,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  aboutText: { alignItems: 'center', gap: 2 },
  promises: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm },
  currencies: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  currency: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 58 },
  symbol: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
});
