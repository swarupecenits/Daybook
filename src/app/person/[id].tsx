import { router, useLocalSearchParams } from 'expo-router';
import { AppState, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Button, IconButton } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { Group, Row } from '@/components/form';
import { Icon, type IconName } from '@/components/icon';
import { Hairline, LinkText, Screen, SectionLabel, TopBar } from '@/components/layout';
import { Press } from '@/components/press';
import { listLayout } from '@/components/task-list';
import { T } from '@/components/text';
import { type LedgerRow, ledger, settlement } from '@/lib/balances';
import { formatDayShort } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { confirm, copyText, goBack, openExternal, shareText } from '@/lib/system';
import { firstName } from '@/lib/text';
import type { DayKey, Person } from '@/lib/types';
import { isVpa, reminderMessage, upiLink, whatsappLink } from '@/lib/upi';
import { useClock } from '@/stores/clock';
import { SETTLED_NOTE, useLedger } from '@/stores/ledger';
import { useSettings } from '@/stores/settings';
import { toast } from '@/stores/toast';
import { elevation, radius, space, useCurrency, useMoney, useTheme } from '@/theme';

const STATEMENT_ROWS = 150;
const PAY_FOLLOW_UP_MS = 15 * 60_000;

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const person = useLedger((s) => s.people.find((p) => p.id === id));
  return <Screen>{person ? <Detail key={person.id} person={person} /> : <Missing />}</Screen>;
}

function Missing() {
  return (
    <>
      <TopBar />
      <EmptyState
        icon="users"
        title="This friend isn’t here"
        body="They may have been deleted for good. Friends removed in the last 30 days are in Trash."
        action={{ label: 'Back', onPress: goBack }}
      />
    </>
  );
}

function Detail({ person }: { person: Person }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const money = useMoney();
  const currency = useCurrency();
  const today = useClock((s) => s.today);
  const entries = useLedger((s) => s.entries);
  const myName = useSettings((s) => s.name);
  const myUpi = useSettings((s) => s.upi);

  const rows = ledger(entries, person.id);
  const balance = rows.length ? rows[0].balance : 0;
  const first = firstName(person.name);
  const trashed = person.deletedAt !== null;
  const canPay = balance < 0 && currency === 'INR' && isVpa(person.upi) && Platform.OS !== 'web';

  // The open stretch starts right after the last time the balance touched zero.
  const zero = rows.findIndex((r) => r.balance === 0);
  const openCount = zero === -1 ? rows.length : zero;
  const since = openCount > 0 ? rows[openCount - 1].entry.date : null;

  const record = (kind: 'gave' | 'got') =>
    router.push({ pathname: '/entry/[id]', params: { id: 'new', person: person.id, kind } });

  const settleNow = () => {
    const entry = useLedger.getState().settle(person.id);
    if (!entry) return;
    haptic('success');
    toast({
      message: `All square with ${first}`,
      icon: 'seal-check',
      tone: 'success',
      action: { label: 'Undo', onPress: () => useLedger.getState().destroyEntry(entry.id) },
    });
  };

  const settleUp = async () => {
    if (!settlement(balance)) return;
    const ok = await confirm({
      title: `Settle up with ${first}?`,
      message:
        balance > 0
          ? `This records ${money(balance)} from ${first} and brings you both to zero.`
          : `This records ${money(-balance)} paid to ${first} and brings you both to zero.`,
      confirm: 'Settle up',
    });
    if (ok) settleNow();
  };

  const remind = async () => {
    const text = reminderMessage({ friend: person.name, amount: balance, currency, myName, myUpi });
    const wa = person.phone ? whatsappLink(person.phone, text, currency) : null;
    if (wa && (await openExternal(wa, 'WhatsApp didn’t open, so here’s the share sheet instead.'))) return;
    await shareText(text, `Reminder for ${first}`);
  };

  // Offer to settle once the user is back from their UPI app; a toast shown right away would expire unseen.
  const pay = async () => {
    const link = upiLink({ vpa: person.upi, name: person.name, amount: -balance, note: 'Settling up' });
    if (!link) return;
    const startedAt = Date.now();
    let left = false;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        left = true;
        return;
      }
      if (!left) return;
      sub.remove();
      if (Date.now() - startedAt > PAY_FOLLOW_UP_MS) return;
      toast({
        message: `Paid ${first}? Mark it settled`,
        icon: 'qr-code',
        action: { label: 'Settle', onPress: settleNow },
        duration: 9000,
      });
    });
    if (!(await openExternal(link, 'No UPI app on this phone could open the payment.'))) sub.remove();
  };

  const share = () => {
    const lines = [
      `${person.name} · Daybook`,
      balance === 0 ? 'All square' : balance > 0 ? `${first} owes me ${money(balance)}` : `I owe ${first} ${money(-balance)}`,
      '',
    ];
    const recent = rows.slice(0, STATEMENT_ROWS).reverse();
    if (rows.length > STATEMENT_ROWS) lines.push(`…${rows.length - STATEMENT_ROWS} earlier entries`);
    for (const { entry } of recent) {
      const day = formatDayShort(entry.date, today);
      const amount = money(entry.amount);
      if (entry.expenseId) {
        lines.push(`${day}  ${entry.note || 'Split bill'}: ${entry.kind === 'gave' ? `${first}’s share` : 'my share'} ${amount}`);
      } else {
        lines.push(`${day}  ${entry.kind === 'gave' ? 'I gave' : 'I got'} ${amount}${entry.note ? ` · ${entry.note}` : ''}`);
      }
    }
    void shareText(lines.join('\n'), `${person.name} · statement`);
  };

  const tone = balance > 0 ? 'positive' : 'negative';

  return (
    <>
      <TopBar
        right={
          trashed ? null : (
            <>
              <IconButton icon="export" label="Share statement" onPress={share} disabled={!rows.length} testID="person-share" />
              <IconButton
                icon="pencil-simple"
                label="Edit friend"
                onPress={() => router.push({ pathname: '/friend/[id]', params: { id: person.id } })}
                testID="person-edit"
              />
            </>
          )
        }
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.xxl * 2 }]}>
        <View style={styles.hero}>
          <Avatar name={person.name} size={64} />
          <T variant="title" align="center" numberOfLines={2} accessibilityRole="header" style={styles.name}>
            {person.name}
          </T>
          {person.phone || person.upi ? (
            <View style={styles.contacts}>
              {person.phone ? (
                <Chip
                  size="sm"
                  icon="phone"
                  label={person.phone}
                  onPress={() => void openExternal(`tel:${person.phone}`, 'This device can’t place calls.')}
                  accessibilityLabel={`Call ${first}`}
                />
              ) : null}
              {person.upi ? (
                <Chip
                  size="sm"
                  icon="qr-code"
                  label={person.upi}
                  onPress={() => void copyText(person.upi, 'UPI ID copied')}
                  accessibilityLabel={`Copy UPI ID ${person.upi}`}
                />
              ) : null}
            </View>
          ) : null}
          {person.note ? (
            <T variant="italic" color="ink2" align="center" style={styles.note}>
              {person.note}
            </T>
          ) : null}
        </View>

        {trashed ? (
          <Banner icon="trash" tint={c.negative} bg={c.negativeSoft} text={`${first} is in the trash, with your shared history.`}>
            <LinkText label="Restore" onPress={() => useLedger.getState().restorePerson(person.id)} testID="person-restore" />
          </Banner>
        ) : (
          <>
            {person.archived ? (
              <Banner icon="archive" tint={c.ink2} bg={c.surface2} text="Archived, so hidden from your friends list.">
                <LinkText
                  label="Unarchive"
                  onPress={() => useLedger.getState().updatePerson(person.id, { archived: false })}
                  testID="person-unarchive"
                />
              </Banner>
            ) : null}

            <View style={[styles.balance, { backgroundColor: c.surface, borderColor: c.line }, elevation(c, 1)]}>
              {balance === 0 ? (
                <View style={styles.square}>
                  <Stamp />
                  <T variant="callout" color="ink2" align="center">
                    {rows.length ? `You and ${first} are all square.` : `No money between you and ${first} yet.`}
                  </T>
                </View>
              ) : (
                <Animated.View key={tone} entering={FadeIn.duration(220)} style={styles.owed}>
                  <T variant="label" color={tone} align="center">
                    {balance > 0 ? `${first} owes you` : `You owe ${first}`}
                  </T>
                  <T
                    variant="hero"
                    color={tone}
                    align="center"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={styles.amount}
                    testID="person-balance">
                    {money(Math.abs(balance))}
                  </T>
                  {since ? (
                    <T variant="small" color="ink3" align="center">
                      {`Since ${formatDayShort(since, today)} · ${openCount} ${openCount === 1 ? 'entry' : 'entries'}`}
                    </T>
                  ) : null}
                </Animated.View>
              )}
            </View>

            <View style={styles.actions}>
              <Button
                label="I gave"
                icon="arrow-up-right"
                variant="secondary"
                onPress={() => record('gave')}
                style={styles.flex}
                accessibilityLabel={`I gave ${first} money`}
                testID="person-gave"
              />
              <Button
                label="I got"
                icon="arrow-down-left"
                variant="secondary"
                onPress={() => record('got')}
                style={styles.flex}
                accessibilityLabel={`I got money from ${first}`}
                testID="person-got"
              />
            </View>

            {balance !== 0 ? (
              <Group>
                {balance > 0 ? (
                  <Row
                    icon={person.phone ? 'whatsapp-logo' : 'chat-circle-text'}
                    label="Send a reminder"
                    detail={
                      person.phone
                        ? `A friendly nudge on WhatsApp${myUpi && currency === 'INR' ? ', with your UPI ID' : ''}`
                        : 'Share a friendly nudge'
                    }
                    onPress={() => void remind()}
                    chevron
                    testID="person-remind"
                  />
                ) : null}
                {canPay ? (
                  <Row
                    icon="qr-code"
                    label={`Pay ${money(-balance)} by UPI`}
                    detail={person.upi}
                    onPress={() => void pay()}
                    chevron
                    testID="person-pay"
                  />
                ) : null}
                <Row
                  icon="seal-check"
                  tint={c.positive}
                  label="Settle up"
                  detail={balance > 0 ? `Mark ${money(balance)} as received` : `Mark ${money(-balance)} as paid`}
                  onPress={() => void settleUp()}
                  testID="person-settle"
                />
              </Group>
            ) : null}

            <View>
              <SectionLabel label={rows.length ? `History · ${rows.length}` : 'History'} />
              {rows.length ? (
                <Animated.View layout={listLayout} style={[styles.list, { backgroundColor: c.surface, borderColor: c.line }]}>
                  {rows.map((row, i) => (
                    <Animated.View
                      key={row.entry.id}
                      layout={listLayout}
                      entering={FadeIn.duration(200)}
                      exiting={FadeOut.duration(120)}>
                      {i > 0 ? <Hairline inset={62} /> : null}
                      <LedgerItem row={row} first={first} today={today} />
                    </Animated.View>
                  ))}
                </Animated.View>
              ) : (
                <T variant="callout" color="ink3" style={styles.emptyHistory}>
                  {`Tap “I gave” when you lend ${first} money or pay for them, and “I got” when they pay you back.`}
                </T>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

function Banner({
  icon,
  tint,
  bg,
  text,
  children,
}: {
  icon: IconName;
  tint: string;
  bg: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Icon name={icon} size={18} color={tint} weight="bold" />
      <T variant="callout" style={styles.flex}>
        {text}
      </T>
      {children}
    </View>
  );
}

/** A rubber stamp, pressed slightly crooked, for a balance of zero. */
function Stamp() {
  const c = useTheme();
  return (
    <Animated.View entering={ZoomIn.springify().damping(13).stiffness(220)}>
      <View style={[styles.stamp, { borderColor: c.positive }]} accessible accessibilityLabel="Settled">
        <Icon name="seal-check" size={20} color={c.positive} weight="fill" />
        <T variant="label" color="positive" style={styles.stampText}>
          Settled
        </T>
      </View>
    </Animated.View>
  );
}

function LedgerItem({ row, first, today }: { row: LedgerRow; first: string; today: DayKey }) {
  const c = useTheme();
  const money = useMoney();
  const { entry, balance } = row;
  const linked = entry.expenseId !== null;
  const settled = !linked && entry.note === SETTLED_NOTE;
  const gave = entry.kind === 'gave';

  const icon: IconName = linked ? 'receipt' : settled ? 'seal-check' : gave ? 'arrow-up-right' : 'arrow-down-left';
  const title = entry.note || (gave ? `You gave ${first}` : `${first} paid you`);
  const kind = linked ? (gave ? `${first}’s share` : 'Your share') : gave ? 'You gave' : 'You got';
  const tileBg = settled ? c.positiveSoft : linked ? c.accentSoft : gave ? c.surface2 : c.positiveSoft;
  const tileFg = settled ? c.positive : linked ? c.accent : gave ? c.ink2 : c.positive;

  const open = () =>
    entry.expenseId
      ? router.push({ pathname: '/expense/[id]', params: { id: entry.expenseId } })
      : router.push({ pathname: '/entry/[id]', params: { id: entry.id } });

  return (
    <Press
      onPress={open}
      scale={0.985}
      style={styles.entry}
      accessibilityLabel={`${kind} ${money(entry.amount)}, ${title}, ${formatDayShort(entry.date, today)}`}
      testID={`ledger-${entry.id}`}>
      <View style={[styles.tile, { backgroundColor: tileBg }]}>
        <Icon name={icon} size={17} color={tileFg} weight={settled ? 'fill' : 'bold'} />
      </View>
      <View style={styles.flex}>
        <T variant="calloutMedium" numberOfLines={1}>
          {title}
        </T>
        <T variant="small" color="ink3" numberOfLines={1}>
          {`${formatDayShort(entry.date, today)} · ${kind}`}
        </T>
      </View>
      <View style={styles.end}>
        <T variant="amount">{money(entry.amount)}</T>
        <T variant="small" color={balance > 0 ? 'positive' : balance < 0 ? 'negative' : 'ink3'}>
          {balance === 0 ? 'square' : `bal ${money(balance, { sign: 'always' })}`}
        </T>
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  end: { alignItems: 'flex-end' },
  scroll: { paddingHorizontal: space.page, gap: space.xl },
  hero: { alignItems: 'center', gap: space.sm, paddingTop: space.xs },
  name: { marginTop: space.xs },
  contacts: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm },
  note: { marginTop: 2, paddingHorizontal: space.lg },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
  },
  balance: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    minHeight: 150,
    justifyContent: 'center',
  },
  owed: { gap: 4 },
  amount: { fontVariant: ['tabular-nums'] },
  square: { alignItems: 'center', gap: space.md },
  stamp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    transform: [{ rotate: '-7deg' }],
  },
  stampText: { fontSize: 16, lineHeight: 20, letterSpacing: 4 },
  actions: { flexDirection: 'row', gap: space.sm },
  list: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg, paddingVertical: 11, minHeight: 62 },
  tile: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  emptyHistory: { paddingHorizontal: 4 },
});
