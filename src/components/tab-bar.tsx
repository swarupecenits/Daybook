import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './icon';
import { Press } from './press';
import { T } from './text';
import { taskCounts } from '@/lib/tasks';
import { useClock } from '@/stores/clock';
import { useNotes } from '@/stores/notes';
import { useTasks } from '@/stores/tasks';
import { useUi } from '@/stores/ui';
import { elevation, radius, space, springs, useTheme } from '@/theme';

export const TAB_BAR_HEIGHT = 64;
/** Toasts float just above the bar. */
export const TAB_TOAST_OFFSET = TAB_BAR_HEIGHT + 4;

const barBottom = (inset: number) => (inset > 0 ? Math.max(inset - 10, 8) : 12);

/** Bottom padding for tab pages so their last row clears the floating bar. */
export function useTabBarClearance(): number {
  const insets = useSafeAreaInsets();
  return barBottom(insets.bottom) + TAB_BAR_HEIGHT + space.xl;
}

const TABS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'sun-horizon', label: 'Today' },
  notes: { icon: 'notebook', label: 'Notes' },
  tasks: { icon: 'check-circle', label: 'Tasks' },
  money: { icon: 'wallet', label: 'Money' },
};

/** Four tabs around a centre "+" slot. */
const SLOTS = 5;
const slotOf = (index: number) => (index < 2 ? index : index + 1);
const MARK = 46;

function addFrom(route: string | undefined) {
  if (route === 'notes') {
    const note = useNotes.getState().create();
    if (note) router.push({ pathname: '/note/[id]', params: { id: note.id, fresh: '1' } });
    return;
  }
  if (route === 'tasks') router.push({ pathname: '/capture', params: { intent: 'task' } });
  else if (route === 'money') {
    const intent = useUi.getState().moneyView === 'spending' ? 'expense' : 'money';
    router.push({ pathname: '/capture', params: { intent } });
  } else router.push('/capture');
}

export function TabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardState((s) => s.isVisible);
  const [slot, setSlot] = useState(0);
  const x = useSharedValue(0);
  const today = useClock((s) => s.today);
  const tasks = useTasks((s) => s.tasks);
  const overdue = taskCounts(tasks, today).overdue;
  const current = state.routes[state.index]?.name;

  useEffect(() => {
    if (slot > 0) x.set(withSpring(slotOf(state.index) * slot + (slot - MARK) / 2, springs.snappy));
  }, [state.index, slot, x]);

  const mark = useAnimatedStyle(() => ({
    opacity: slot > 0 ? 1 : 0,
    transform: [{ translateX: x.get() }],
  }));
  const hide = useAnimatedStyle(() => ({
    transform: [{ translateY: withTiming(keyboard ? 160 : 0, { duration: keyboard ? 120 : 220 }) }],
  }));

  return (
    <Animated.View
      style={[styles.wrap, { bottom: barBottom(insets.bottom) }, hide]}
      accessibilityRole="tablist">
      <View
        onLayout={(e) => {
          const next = e.nativeEvent.layout.width / SLOTS;
          if (Math.abs(next - slot) > 0.5) {
            x.set(slotOf(state.index) * next + (next - MARK) / 2);
            setSlot(next);
          }
        }}
        style={[styles.bar, { backgroundColor: c.raised, borderColor: c.line }, elevation(c, 2)]}>
        <Animated.View style={[styles.mark, { backgroundColor: c.highlight }, mark]} />
        {state.routes.map((route, index) => {
          const meta = TABS[route.name];
          if (!meta) return null;
          const focused = state.index === index;
          const options = descriptors[route.key]?.options;
          const tab = (
            <Press
              key={route.key}
              onPress={() => {
                const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigateToTab(route.key);
              }}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              haptic={focused ? false : 'select'}
              scale={0.9}
              accessibilityRole="tab"
              aria-selected={focused}
              accessibilityLabel={
                route.name === 'tasks' && overdue ? `${meta.label}, ${overdue} overdue` : meta.label
              }
              testID={options?.tabBarButtonTestID ?? `tab-${route.name}`}
              style={styles.tab}>
              <View>
                <Icon name={meta.icon} size={24} color={focused ? c.ink : c.ink3} weight={focused ? 'fill' : 'regular'} />
                {route.name === 'tasks' && overdue > 0 ? (
                  <View style={[styles.badge, { backgroundColor: c.negative, borderColor: c.raised }]} />
                ) : null}
              </View>
              <T variant="small" color={focused ? 'ink' : 'ink3'} style={styles.label} numberOfLines={1}>
                {meta.label}
              </T>
            </Press>
          );
          if (index !== 2) return tab;
          return [
            <View key="add" style={styles.tab}>
              <Press
                onPress={() => addFrom(current)}
                onLongPress={() => router.push('/search')}
                haptic="soft"
                scale={0.88}
                accessibilityLabel={current === 'notes' ? 'New note' : 'Add'}
                accessibilityHint="Long press to search"
                testID="tab-add"
                style={[styles.add, { backgroundColor: c.ink }]}>
                <Icon name="plus" size={24} color={c.bg} weight="bold" />
              </Press>
            </View>,
            tab,
          ];
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: TAB_BAR_HEIGHT,
    width: '100%',
    maxWidth: 480,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  mark: { position: 'absolute', left: 0, top: 9, width: MARK, height: 28, borderRadius: 14 },
  tab: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 11, lineHeight: 13 },
  add: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -1, right: -3, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
});
