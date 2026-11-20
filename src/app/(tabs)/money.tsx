import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { BudgetSheet } from '@/components/budget-sheet';
import { Button, IconButton } from '@/components/button';
import { DayBars, Meter, StackBar } from '@/components/charts';
import { Chip, Segmented } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { Card, Hairline, LinkText, PageHeader, SectionLabel } from '@/components/layout';
import { Press } from '@/components/press';
import { useTabBarClearance } from '@/components/tab-bar';
import { listLayout } from '@/components/task-list';
import { T } from '@/components/text';
import { balances, type FriendFilter, type FriendRow, friendRows, lastActivity, totals } from '@/lib/balances';
import { category, METHODS } from '@/lib/categories';
import { addMonthKey, formatDay, formatDayShort, formatMonth, MONTHS, monthOf, relativeTime } from '@/lib/dates';
import { budgetStatus, byCategory, dailyTotals, groupByDay, inMonth, spent } from '@/lib/spending';
import type { Expense } from '@/lib/types';
import { useClock } from '@/stores/clock';
import { useLedger } from '@/stores/ledger';
import { useSettings } from '@/stores/settings';
import { useUi } from '@/stores/ui';
import { radius, space, useMoney, useTheme } from '@/theme';

const FILTERS: readonly { value: FriendFilter; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'owe-me', label: 'Owe you' },
  { value: 'i-owe', label: 'You owe' },
  { value: 'settled', label: 'Settled' },
];

const matches = (row: FriendRow, filter: FriendFilter) =>
  filter === 'all' ||
  (filter === 'owe-me' ? row.balance > 0 : filter === 'i-owe' ? row.balance < 0 : row.balance === 0);

const newEntry = () => router.push({ pathname: '/entry/[id]', params: { id: 'new' } });
const newExpense = () => router.push({ pathname: '/expense/[id]', params: { id: 'new' } });
const newFriend = () => router.push({ pathname: '/friend/[id]', params: { id: 'new' } });

export default function Money() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const clearance = useTabBarClearance();
  const money = useMoney();
  const today = useClock((s) => s.today);
  const view = useUi((s) => s.moneyView);
  const people = useLedger((s) => s.people);
  const entries = useLedger((s) => s.entries);
  const expenses = useLedger((s) => s.expenses);

  const sum = totals(balances(entries), people);
  const month = monthOf(today);
  const kicker =
    view === 'spending'
      ? `${MONTHS[Number(month.slice(5, 7)) - 1]} · ${money(spent(inMonth(expenses, month)))} spent`
      : sum.open
        ? `${sum.open} open · net ${money(sum.net, { sign: 'always' })}`
        : 'All square';

  return (
    // The scroller starts below the status bar so the sticky switcher never slides under it.
    <View style={[styles.flex, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: clearance }}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}>
        <PageHeader
          style={styles.header}
          label={kicker}
          title="Money"
          right={
            <>
              <IconButton icon="magnifying-glass" label="Search" onPress={() => router.push('/search')} />
              <IconButton icon="user-plus" label="Add a friend" onPress={newFriend} testID="money-add-friend" />
            </>
          }
        />
        <View style={[styles.sticky, { backgroundColor: c.bg }]}>
          <Segmented
            value={view}
            onChange={(v) => useUi.setState({ moneyView: v })}
            options={[
              { value: 'friends', label: 'Friends', count: sum.open },
              { value: 'spending', label: 'Spending' },
            ]}
            testID="money-view"
          />
        </View>
        <View style={styles.body}>{view === 'friends' ? <FriendsView /> : <SpendingView />}</View>
      </ScrollView>
    </View>
  );
}

function FriendsView() {
  const c = useTheme();
  const money = useMoney();
  const at = useClock((s) => s.at);
  const people = useLedger((s) => s.people);
  const entries = useLedger((s) => s.entries);
  const [filter, setFilter] = useState<FriendFilter>('all');
  const [showArchived, setShowArchived] = useState(false);

  const all = friendRows(people, entries);
  const counts: Record<FriendFilter, number> = { all: all.length, 'owe-me': 0, 'i-owe': 0, settled: 0 };
  for (const row of all) {
    if (row.balance > 0) counts['owe-me'] += 1;
    else if (row.balance < 0) counts['i-owe'] += 1;
    else counts.settled += 1;
  }
  // Settling the last friend in a filter would otherwise leave an empty list behind a selected chip.
  if (filter !== 'all' && counts[filter] === 0) setFilter('all');
  const rows = all.filter((r) => matches(r, filter));
  const sum = totals(balances(entries), people);

  const archivedPeople = people.filter((p) => p.deletedAt === null && p.archived);
  const bal = balances(entries);
  const last = lastActivity(entries);
  const archived: FriendRow[] = archivedPeople.map((person) => ({
    person,
    balance: bal.get(person.id) ?? 0,
    lastAt: last.get(person.id) ?? person.createdAt,
  }));

  if (!all.length && !archived.length) {
    return (
      <EmptyState
        icon="handshake"
        title="Lend, borrow, split"
        body="Note down money you give to or get from friends. Daybook keeps a running balance for each of them, so nobody has to remember."
        action={{ label: 'Record money', icon: 'plus', onPress: newEntry }}
      />
    );
  }

  const netTone = sum.net > 0 ? 'positive' : sum.net < 0 ? 'negative' : 'ink3';

  return (
    <>
      <Card padded={false} testID="money-summary">
        <View style={styles.sumRow}>
          <View style={styles.flex}>
            <T variant="label" color="ink3">
              Owed to you
            </T>
            <T variant="amountLarge" color={sum.owedToMe ? 'positive' : 'ink3'} style={styles.sumAmount}>
              {money(sum.owedToMe)}
            </T>
          </View>
          <View style={[styles.rule, { backgroundColor: c.line }]} />
          <View style={[styles.flex, styles.end]}>
            <T variant="label" color="ink3">
              You owe
            </T>
            <T variant="amountLarge" color={sum.iOwe ? 'negative' : 'ink3'} style={styles.sumAmount}>
              {money(sum.iOwe)}
            </T>
          </View>
        </View>
        {sum.owedToMe || sum.iOwe ? (
          <StackBar
            height={6}
            style={styles.sumBar}
            parts={[
              { key: 'in', value: sum.owedToMe, color: c.positive },
              { key: 'out', value: sum.iOwe, color: c.negative },
            ]}
          />
        ) : null}
        <Hairline />
        <View style={styles.sumFoot}>
          <T variant="small" color="ink3" style={styles.flex}>
            {sum.net === 0 ? 'Overall, you’re all square' : sum.net > 0 ? 'Overall, you’ll get back' : 'Overall, you’ll pay back'}
          </T>
          <T variant="amount" color={netTone}>
            {sum.net === 0 ? '—' : money(Math.abs(sum.net))}
          </T>
        </View>
      </Card>

      <View style={styles.actions}>
        <Button label="Record money" icon="handshake" variant="ink" size="sm" onPress={newEntry} testID="money-record" />
        <Button label="Split a bill" icon="receipt" variant="secondary" size="sm" onPress={newExpense} testID="money-split" />
      </View>

      {all.length ? (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chips}>
            {FILTERS.filter((f) => f.value === 'all' || counts[f.value] > 0).map((f) => (
              <Chip
                key={f.value}
                size="sm"
                label={f.label}
                count={counts[f.value]}
                selected={filter === f.value}
                onPress={() => setFilter(f.value)}
                testID={`friend-filter-${f.value}`}
              />
            ))}
          </ScrollView>
          <Animated.View layout={listLayout} style={[styles.list, { backgroundColor: c.surface, borderColor: c.line }]}>
            {rows.map((row, i) => (
              <Animated.View key={row.person.id} layout={listLayout} entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
                {i > 0 ? <Hairline inset={70} /> : null}
                <FriendItem row={row} at={at} />
              </Animated.View>
            ))}
          </Animated.View>
        </View>
      ) : null}

      {archived.length ? (
        <View>
          <View style={styles.center}>
            <LinkText
              label={showArchived ? 'Hide archived friends' : `Show ${archived.length} archived`}
              color="ink3"
              onPress={() => setShowArchived(!showArchived)}
              testID="friends-archived"
            />
          </View>
          {showArchived ? (
            <Animated.View
              entering={FadeIn.duration(180)}
              style={[styles.list, styles.archivedList, { backgroundColor: c.surface, borderColor: c.line }]}>
              {archived.map((row, i) => (
                <View key={row.person.id}>
                  {i > 0 ? <Hairline inset={70} /> : null}
                  <FriendItem row={row} at={at} />
                </View>
              ))}
            </Animated.View>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

function FriendItem({ row, at }: { row: FriendRow; at: number }) {
  const money = useMoney();
  const { person, balance } = row;
  const status = balance > 0 ? 'owes you' : balance < 0 ? 'you owe' : 'square';
  const when = relativeTime(row.lastAt, at);
  return (
    <Press
      onPress={() => router.push({ pathname: '/person/[id]', params: { id: person.id } })}
      scale={0.985}
      style={styles.friend}
      accessibilityLabel={`${person.name}, ${balance === 0 ? 'settled up' : `${status} ${money(Math.abs(balance))}`}`}
      testID={`friend-${person.id}`}>
      <Avatar name={person.name} />
      <View style={styles.flex}>
        <T variant="bodyMedium" numberOfLines={1}>
          {person.name}
        </T>
        <T variant="small" color="ink3" numberOfLines={1}>
          {balance === 0 ? `Settled up · ${when}` : when.charAt(0).toUpperCase() + when.slice(1)}
        </T>
      </View>
      <View style={styles.end}>
        <T variant="amount" color={balance > 0 ? 'positive' : balance < 0 ? 'negative' : 'ink3'}>
          {balance === 0 ? '—' : money(Math.abs(balance))}
        </T>
        <T variant="label" color="ink3" style={styles.tiny}>
          {status}
        </T>
      </View>
    </Press>
  );
}

function SpendingView() {
  const c = useTheme();
  const money = useMoney();
  const today = useClock((s) => s.today);
  const expenses = useLedger((s) => s.expenses);
  const people = useLedger((s) => s.people);
  const budget = useSettings((s) => s.budget);
  const current = monthOf(today);
  const [month, setMonth] = useState(current);
  const [budgetOpen, setBudgetOpen] = useState(false);
  // The clock can move back across a month boundary (travel, manual change); never show the future.
  if (month > current) setMonth(current);

  const isCurrent = month === current;
  const list = inMonth(expenses, month);
  const total = spent(list);
  const status = budgetStatus(total, budget, month, today);
  const cats = byCategory(list);
  const days = dailyTotals(list, month);
  const groups = groupByDay(list);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const monthName = MONTHS[Number(month.slice(5, 7)) - 1];
  const dark = c.scheme === 'dark' ? 1 : 0;

  let peak = 0;
  for (let i = 1; i < days.length; i++) if (days[i] > days[peak]) peak = i;
  const peakDay = `${month}-${String(peak + 1).padStart(2, '0')}`;

  return (
    <>
      <View style={styles.monthBar}>
        <IconButton
          icon="caret-left"
          label="Previous month"
          onPress={() => setMonth(addMonthKey(month, -1))}
          weight="bold"
          iconSize={18}
          testID="month-prev"
        />
        <Press
          onPress={() => setMonth(current)}
          disabled={isCurrent}
          scale={0.97}
          accessibilityLabel={isCurrent ? formatMonth(month) : `${formatMonth(month)}, back to this month`}>
          <T variant="heading" align="center" accessibilityLiveRegion="polite">
            {formatMonth(month)}
          </T>
        </Press>
        <IconButton
          icon="caret-right"
          label="Next month"
          onPress={() => setMonth(addMonthKey(month, 1))}
          disabled={isCurrent}
          color={isCurrent ? c.lineStrong : undefined}
          weight="bold"
          iconSize={18}
          testID="month-next"
        />
      </View>

      <Card testID="spend-card">
        <View style={styles.spendTop}>
          <T variant="label" color="ink3" style={styles.flex}>
            {isCurrent ? 'Spent this month' : `Spent in ${monthName}`}
          </T>
          {budget > 0 ? <LinkText label="Edit budget" onPress={() => setBudgetOpen(true)} testID="budget-edit" /> : null}
        </View>
        <T variant="display" style={styles.bigAmount} numberOfLines={1} adjustsFontSizeToFit>
          {money(total)}
        </T>
        {budget > 0 ? (
          <View style={styles.budget}>
            <Meter value={status.ratio} color={status.ratio > 0.85 ? c.warning : c.accent} over={c.negative} />
            <View style={styles.budgetRow}>
              <T variant="small" color={status.remaining < 0 ? 'negative' : 'ink2'} style={styles.flex}>
                {status.remaining < 0
                  ? `${money(-status.remaining)} over the ${money(budget, { compact: true })} budget`
                  : `${money(status.remaining)} left of ${money(budget, { compact: true })}`}
              </T>
              {isCurrent && status.perDay > 0 ? (
                <T variant="small" color="ink3">
                  {`≈ ${money(status.perDay, { compact: true })} a day`}
                </T>
              ) : null}
            </View>
            {isCurrent && status.remaining >= 0 && status.projected > budget ? (
              <T variant="small" color="warning">
                {`At this pace you’ll reach ${money(status.projected, { compact: true })} by month end`}
              </T>
            ) : null}
          </View>
        ) : (
          <Press onPress={() => setBudgetOpen(true)} scale={0.97} style={styles.setBudget} testID="budget-set">
            <Icon name="target" size={16} color={c.accent} weight="bold" />
            <T variant="caption" color="accent">
              Set a monthly budget
            </T>
          </Press>
        )}
      </Card>

      {list.length === 0 ? (
        <EmptyState
          icon="receipt"
          title={isCurrent ? 'Nothing spent yet' : `No expenses in ${monthName}`}
          body={
            isCurrent
              ? 'Add what you spend, from chai to rent, and see where the month goes. Split bills with friends as you go.'
              : 'Use the arrows to look at another month.'
          }
          action={isCurrent ? { label: 'Add expense', icon: 'plus', onPress: newExpense } : undefined}
          compact
        />
      ) : (
        <>
          {total > 0 ? (
            <View>
              <SectionLabel
                label="Day by day"
                right={
                  <T variant="small" color="ink3">
                    {`Peak ${money(days[peak], { compact: true })} · ${formatDayShort(peakDay, today)}`}
                  </T>
                }
              />
              <DayBars
                values={days}
                highlight={isCurrent ? Number(today.slice(8, 10)) - 1 : undefined}
                color={c.accent}
                height={72}
                accessibilityLabel={`Daily spending in ${monthName}. Highest was ${money(days[peak])} on ${formatDayShort(peakDay, today)}.`}
              />
              <View style={styles.axis}>
                <T variant="label" color="ink3">
                  1
                </T>
                <T variant="label" color="ink3">
                  {days.length}
                </T>
              </View>
            </View>
          ) : null}

          {cats.length ? (
            <View>
              <SectionLabel label="Where it went" />
              <StackBar
                height={10}
                parts={cats.map((x) => ({ key: x.id, value: x.total, color: category(x.id).color[dark] }))}
              />
              <View style={styles.cats}>
                {cats.map((x) => {
                  const meta = category(x.id);
                  const color = meta.color[dark];
                  return (
                    <View key={x.id} style={styles.cat} accessible accessibilityLabel={`${meta.label}, ${money(x.total)}`}>
                      <View style={[styles.catTile, { backgroundColor: `${color}24` }]}>
                        <Icon name={meta.icon} size={15} color={color} weight="bold" />
                      </View>
                      <T variant="callout" style={styles.flex} numberOfLines={1}>
                        {meta.label}
                      </T>
                      <T variant="small" color="ink3" style={styles.pct}>
                        {`${Math.max(1, Math.round((x.total / total) * 100))}%`}
                      </T>
                      <T variant="amount" style={styles.catAmount}>
                        {money(x.total)}
                      </T>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.groups}>
            <SectionLabel
              label={`Expenses · ${list.length}`}
              right={<LinkText label="Add expense" onPress={newExpense} testID="spend-add" />}
            />
            {groups.map((g) => (
              <Animated.View key={g.day} layout={listLayout} entering={FadeIn} exiting={FadeOut}>
                <View style={styles.dayHead}>
                  <T variant="caption" color="ink2">
                    {formatDay(g.day, today)}
                  </T>
                  <T variant="small" color="ink3">
                    {money(g.total)}
                  </T>
                </View>
                <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.line }]}>
                  {g.items.map((e, i) => (
                    <View key={e.id}>
                      {i > 0 ? <Hairline inset={64} /> : null}
                      <ExpenseItem expense={e} names={names} />
                    </View>
                  ))}
                </View>
              </Animated.View>
            ))}
          </View>
        </>
      )}

      <BudgetSheet visible={budgetOpen} onClose={() => setBudgetOpen(false)} />
    </>
  );
}

function ExpenseItem({ expense, names }: { expense: Expense; names: ReadonlyMap<string, string> }) {
  const c = useTheme();
  const money = useMoney();
  const meta = category(expense.category);
  const color = meta.color[c.scheme === 'dark' ? 1 : 0];
  const split = expense.split.length > 0;
  const method = METHODS.find((m) => m.id === expense.method)?.label ?? '';
  const people = expense.split.length + (expense.share > 0 ? 1 : 0);
  const detail = !split
    ? `${meta.label} · ${method}`
    : expense.paidBy === 'me'
      ? `You paid · split ${people} ways`
      : `${names.get(expense.paidBy) ?? 'A friend'} paid · split ${people} ways`;
  return (
    <Press
      onPress={() => router.push({ pathname: '/expense/[id]', params: { id: expense.id } })}
      scale={0.985}
      style={styles.expense}
      accessibilityLabel={`${expense.title}, ${money(expense.share)}${split ? ` of ${money(expense.amount)}` : ''}`}
      testID={`expense-${expense.id}`}>
      <View style={[styles.expTile, { backgroundColor: `${color}24` }]}>
        <Icon name={meta.icon} size={19} color={color} weight="bold" />
      </View>
      <View style={styles.flex}>
        <T variant="bodyMedium" numberOfLines={1}>
          {expense.title}
        </T>
        <T variant="small" color="ink3" numberOfLines={1}>
          {detail}
        </T>
      </View>
      <View style={styles.end}>
        <T variant="amount" color={expense.share ? 'ink' : 'ink3'}>
          {money(expense.share)}
        </T>
        {split ? (
          <T variant="small" color="ink3">
            {`of ${money(expense.amount)}`}
          </T>
        ) : null}
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  end: { alignItems: 'flex-end' },
  center: { alignItems: 'center', paddingVertical: space.sm },
  header: { paddingTop: 4 },
  sticky: { paddingHorizontal: space.page, paddingTop: space.md, paddingBottom: space.sm },
  body: { paddingHorizontal: space.page, paddingTop: space.md, gap: space.xl },
  sumRow: { flexDirection: 'row', alignItems: 'center', padding: space.lg, paddingBottom: space.md, gap: space.md },
  sumAmount: { marginTop: 4 },
  rule: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  sumBar: { marginHorizontal: space.lg, marginBottom: space.lg },
  sumFoot: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: -space.sm },
  chipScroll: { marginHorizontal: -space.page, marginBottom: space.md },
  chips: { gap: space.sm, paddingHorizontal: space.page },
  list: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  archivedList: { marginTop: space.sm, opacity: 0.85 },
  friend: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: space.lg, paddingVertical: 12, minHeight: 66 },
  tiny: { fontSize: 9, letterSpacing: 1, marginTop: 1 },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: -8, marginBottom: -space.sm },
  spendTop: { flexDirection: 'row', alignItems: 'center', minHeight: 20 },
  bigAmount: { marginTop: space.xs, fontVariant: ['tabular-nums'] },
  budget: { marginTop: space.md, gap: space.sm },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  setBudget: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.md, alignSelf: 'flex-start' },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  cats: { marginTop: space.md, gap: 2 },
  cat: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 40 },
  catTile: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  pct: { minWidth: 34, textAlign: 'right', fontVariant: ['tabular-nums'] },
  catAmount: { minWidth: 84, textAlign: 'right' },
  groups: { gap: space.sm },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: space.sm,
    marginBottom: 6,
  },
  expense: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg, paddingVertical: 11, minHeight: 62 },
  expTile: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
