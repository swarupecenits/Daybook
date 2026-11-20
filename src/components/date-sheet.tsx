import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, IconButton } from './button';
import { Chip } from './chip';
import { LinkText } from './layout';
import { Press } from './press';
import { Sheet } from './sheet';
import { T } from './text';
import {
  addDays,
  addMonthKey,
  formatDayLong,
  formatMonth,
  formatTime,
  monthGrid,
  monthOf,
  pad,
  startOfWeek,
  weekdayLabels,
  weekdayOf,
} from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import type { DayKey, TimeKey } from '@/lib/types';
import { useClock } from '@/stores/clock';
import { useSettings } from '@/stores/settings';
import { radius, space, useTheme } from '@/theme';

type DateSheetProps = {
  visible: boolean;
  onClose: () => void;
  value: DayKey | null;
  onChange: (day: DayKey | null) => void;
  title?: string;
  /** Offer "No date". */
  clearable?: boolean;
  /** Quick picks look back (yesterday, last week) instead of ahead, for things that already happened. */
  past?: boolean;
};

export function DateSheet({
  visible,
  onClose,
  value,
  onChange,
  title = 'Pick a day',
  clearable = true,
  past = false,
}: DateSheetProps) {
  const c = useTheme();
  const today = useClock((s) => s.today);
  const weekStart = useSettings((s) => s.weekStart);
  const [month, setMonth] = useState(() => monthOf(value ?? today));
  const [shown, setShown] = useState(visible);
  if (shown !== visible) {
    setShown(visible);
    if (visible) setMonth(monthOf(value ?? today));
  }

  const pick = (day: DayKey | null) => {
    haptic('select');
    onChange(day);
    onClose();
  };

  const weekday = weekdayOf(today);
  const quick: { label: string; day: DayKey }[] = past
    ? [
        { label: 'Today', day: today },
        { label: 'Yesterday', day: addDays(today, -1) },
        { label: '2 days ago', day: addDays(today, -2) },
        { label: 'A week ago', day: addDays(today, -7) },
      ]
    : [
        { label: 'Today', day: today },
        { label: 'Tomorrow', day: addDays(today, 1) },
        {
          label: weekday === 6 || weekday === 0 ? 'Next weekend' : 'This weekend',
          day: addDays(today, weekday === 6 ? 7 : 6 - weekday),
        },
        { label: 'Next week', day: startOfWeek(addDays(today, 7), weekStart) },
      ];

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      testID="date-sheet"
      right={clearable && value ? <LinkText label="No date" onPress={() => pick(null)} color="negative" /> : null}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick}>
        {quick.map((q) => (
          <Chip key={q.label} label={q.label} selected={value === q.day} onPress={() => pick(q.day)} />
        ))}
      </ScrollView>
      <View style={styles.monthBar}>
        <IconButton icon="caret-left" label="Previous month" onPress={() => setMonth(addMonthKey(month, -1))} weight="bold" iconSize={18} />
        <T variant="headline" accessibilityRole="header" accessibilityLiveRegion="polite">
          {formatMonth(month)}
        </T>
        <IconButton icon="caret-right" label="Next month" onPress={() => setMonth(addMonthKey(month, 1))} weight="bold" iconSize={18} />
      </View>
      <View style={styles.week}>
        {weekdayLabels(weekStart).map((d) => (
          <T key={d} variant="label" color="ink3" align="center" style={styles.cell}>
            {d.slice(0, 2)}
          </T>
        ))}
      </View>
      {monthGrid(month, weekStart).map((week) => (
        <View key={week[0]} style={styles.week}>
          {week.map((day) => {
            const inMonth = monthOf(day) === month;
            const selected = day === value;
            const isToday = day === today;
            return (
              <View key={day} style={styles.cell}>
                <Press
                  onPress={() => pick(day)}
                  scale={0.88}
                  accessibilityLabel={formatDayLong(day)}
                  aria-selected={selected}
                  testID={`day-${day}`}
                  style={[
                    styles.day,
                    selected && { backgroundColor: c.ink },
                    !selected && isToday && { borderColor: c.accent, borderWidth: 1.5 },
                  ]}>
                  <T
                    variant={selected || isToday ? 'calloutMedium' : 'callout'}
                    color={selected ? 'bg' : isToday ? 'accent' : inMonth ? 'ink' : 'ink3'}
                    style={!inMonth && !selected ? styles.faded : undefined}>
                    {Number(day.slice(8, 10))}
                  </T>
                </Press>
              </View>
            );
          })}
        </View>
      ))}
    </Sheet>
  );
}

const PRESET_TIMES: TimeKey[] = ['09:00', '11:00', '13:00', '15:00', '18:00', '21:00'];
const MINUTES = [0, 15, 30, 45];

type TimeSheetProps = {
  visible: boolean;
  onClose: () => void;
  value: TimeKey | null;
  onChange: (time: TimeKey | null) => void;
  title?: string;
};

export function TimeSheet({ visible, onClose, value, onChange, title = 'Pick a time' }: TimeSheetProps) {
  const [hour, setHour] = useState(() => Number((value ?? '09:00').slice(0, 2)));
  const [minute, setMinute] = useState(() => Number((value ?? '09:00').slice(3, 5)));
  const [shown, setShown] = useState(visible);
  if (shown !== visible) {
    setShown(visible);
    if (visible) {
      setHour(Number((value ?? '09:00').slice(0, 2)));
      setMinute(Number((value ?? '09:00').slice(3, 5)));
    }
  }
  const pick = (time: TimeKey | null) => {
    haptic('select');
    onChange(time);
    onClose();
  };
  const current = `${pad(hour)}:${pad(minute)}`;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      testID="time-sheet"
      right={value ? <LinkText label="No time" onPress={() => pick(null)} color="negative" /> : null}>
      <View style={styles.wrap}>
        {PRESET_TIMES.map((t) => (
          <Chip key={t} label={formatTime(t)} selected={value === t} onPress={() => pick(t)} />
        ))}
      </View>
      <T variant="label" color="ink3" style={styles.subhead}>
        Hour
      </T>
      <View style={styles.grid}>
        {Array.from({ length: 24 }, (_, h) => (
          <Chip
            key={h}
            size="sm"
            label={formatTime(`${pad(h)}:00`)}
            selected={hour === h}
            onPress={() => setHour(h)}
            style={styles.hour}
          />
        ))}
      </View>
      <T variant="label" color="ink3" style={styles.subhead}>
        Minute
      </T>
      <View style={styles.wrap}>
        {MINUTES.map((m) => (
          <Chip key={m} label={`:${pad(m)}`} selected={minute === m} onPress={() => setMinute(m)} />
        ))}
      </View>
      <Button label={`Set ${formatTime(current)}`} onPress={() => pick(current)} variant="ink" full style={styles.done} testID="time-done" />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  quick: { gap: space.sm, paddingBottom: space.md },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  week: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 3 },
  day: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  faded: { opacity: 0.45 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  hour: { minWidth: 64, justifyContent: 'center' },
  subhead: { marginTop: space.lg, marginBottom: space.sm },
  done: { marginTop: space.xl },
});
