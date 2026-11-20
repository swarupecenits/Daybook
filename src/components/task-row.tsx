import { router } from 'expo-router';
import { memo, useEffect, useEffectEvent, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, {
  SwipeDirection,
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon, type IconName } from './icon';
import { Press } from './press';
import { T } from './text';
import { formatDay, formatTime } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { dueLabelTone, isLate } from '@/lib/tasks';
import type { Priority, Task } from '@/lib/types';
import { completeTask, deleteTask, reopenTask, snoozeTask } from '@/stores/actions';
import { useClock } from '@/stores/clock';
import { type Palette, space, springs, useTheme } from '@/theme';

const PRIORITY_NAME: Record<Priority, string> = { 0: '', 1: 'low', 2: 'medium', 3: 'high' };

export function priorityColor(c: Palette, priority: Priority): string {
  return priority === 3 ? c.negative : priority === 2 ? c.warning : priority === 1 ? c.accent : c.lineStrong;
}

type Meta = { key: string; icon?: IconName; label?: string; color: string };

type CheckProps = { done: boolean; priority: Priority; onPress: () => void; label: string; testID?: string };

export function TaskCheck({ done, priority, onPress, label, testID }: CheckProps) {
  const c = useTheme();
  const pop = useSharedValue(1);
  const ring = priorityColor(c, priority);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  return (
    <Press
      onPress={() => {
        pop.set(withSequence(withTiming(0.78, { duration: 90 }), withSpring(1, springs.snappy)));
        onPress();
      }}
      scale={1}
      hitSlop={12}
      accessibilityRole="checkbox"
      aria-checked={done}
      accessibilityLabel={label}
      testID={testID}>
      <Animated.View
        style={[
          styles.check,
          {
            borderColor: done ? c.ink : ring,
            backgroundColor: done ? c.ink : priority > 0 ? `${ring}14` : 'transparent',
          },
          style,
        ]}>
        {done ? <Icon name="check" size={14} color={c.bg} weight="bold" /> : null}
      </Animated.View>
    </Press>
  );
}

type TaskRowProps = {
  task: Task;
  /** Off inside lists that are already grouped by day. */
  showDate?: boolean;
};

function TaskRowBase({ task, showDate = true }: TaskRowProps) {
  const c = useTheme();
  const today = useClock((s) => s.today);
  const now = useClock((s) => s.now);
  const swipe = useRef<SwipeableMethods>(null);
  // Completion waits a beat so the check and strike-through land before the row leaves the list.
  const [pending, setPending] = useState(false);
  const [seenDoneAt, setSeenDoneAt] = useState(task.doneAt);
  if (seenDoneAt !== task.doneAt) {
    setSeenDoneAt(task.doneAt);
    setPending(false);
  }
  const done = task.doneAt !== null || pending;

  const finish = useEffectEvent(() => completeTask(task.id));
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => finish(), 420);
    return () => clearTimeout(timer);
  }, [pending]);

  const toggle = () => {
    if (task.doneAt !== null) reopenTask(task.id);
    else if (pending) setPending(false);
    else {
      haptic('soft');
      setPending(true);
    }
  };

  const meta: Meta[] = [];
  if (task.doneAt === null) {
    const tone = dueLabelTone(task, today);
    if (showDate && task.dueDate) {
      meta.push({
        key: 'date',
        icon: tone === 'overdue' ? 'warning' : 'calendar-blank',
        label: formatDay(task.dueDate, today),
        color: tone === 'overdue' ? c.negative : tone === 'today' ? c.accent : tone === 'soon' ? c.warning : c.ink3,
      });
    }
    if (task.dueTime) {
      meta.push({
        key: 'time',
        icon: 'clock',
        label: formatTime(task.dueTime),
        color: isLate(task, today, now) ? c.negative : c.ink3,
      });
    }
    if (task.remind && task.dueDate) meta.push({ key: 'bell', icon: 'bell', color: c.ink3 });
    if (task.repeat !== 'none') meta.push({ key: 'repeat', icon: 'repeat', color: c.ink3 });
  }
  if (task.subtasks.length) {
    const doneCount = task.subtasks.filter((s) => s.done).length;
    meta.push({ key: 'subtasks', icon: 'list-checks', label: `${doneCount}/${task.subtasks.length}`, color: c.ink3 });
  }
  if (task.notes.trim()) meta.push({ key: 'notes', icon: 'note-pencil', color: c.ink3 });
  if (task.tag) meta.push({ key: 'tag', label: `#${task.tag}`, color: c.accent });

  const spoken = [
    task.title,
    PRIORITY_NAME[task.priority] && `${PRIORITY_NAME[task.priority]} priority`,
    ...meta.filter((m) => m.label).map((m) => m.label),
    task.doneAt !== null && 'completed',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <ReanimatedSwipeable
      ref={swipe}
      friction={1.6}
      leftThreshold={64}
      rightThreshold={48}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={(progress) => <SwipeDone progress={progress} done={task.doneAt !== null} />}
      renderRightActions={(_progress, _translation, methods) => (
        <View style={styles.actions}>
          {task.doneAt === null ? (
            <SwipeButton
              icon="clock"
              label="Later"
              color={c.warning}
              bg={c.warningSoft}
              onPress={() => {
                methods.close();
                snoozeTask(task.id);
              }}
            />
          ) : null}
          <SwipeButton
            icon="trash"
            label="Delete"
            color={c.negative}
            bg={c.negativeSoft}
            onPress={() => {
              methods.close();
              deleteTask(task.id);
            }}
          />
        </View>
      )}
      onSwipeableOpen={(direction) => {
        if (direction !== SwipeDirection.RIGHT) return;
        swipe.current?.close();
        toggle();
      }}>
      <Press
        onPress={() => router.push({ pathname: '/task/[id]', params: { id: task.id } })}
        scale={0.99}
        accessibilityLabel={spoken}
        accessibilityHint="Opens the task. Swipe right to complete, left for more."
        testID={`task-${task.id}`}
        style={[styles.row, { backgroundColor: c.surface }]}>
        <View style={styles.checkSlot}>
          <TaskCheck
            done={done}
            priority={task.priority}
            onPress={toggle}
            label={task.doneAt !== null ? `Mark ${task.title} as not done` : `Complete ${task.title}`}
            testID={`check-${task.id}`}
          />
        </View>
        <View style={styles.text}>
          <T
            variant="bodyMedium"
            color={done ? 'ink3' : 'ink'}
            numberOfLines={2}
            style={done ? styles.strike : undefined}>
            {task.title}
          </T>
          {meta.length ? (
            <View style={styles.meta}>
              {meta.map((m) => (
                <View key={m.key} style={styles.metaItem}>
                  {m.icon ? <Icon name={m.icon} size={13} color={m.color} weight="bold" /> : null}
                  {m.label ? (
                    <T variant="small" color={m.color} numberOfLines={1}>
                      {m.label}
                    </T>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {task.priority === 3 && !done ? <Icon name="flag" size={15} color={c.negative} weight="fill" /> : null}
      </Press>
    </ReanimatedSwipeable>
  );
}

export const TaskRow = memo(TaskRowBase);

function SwipeDone({ progress, done }: { progress: SharedValue<number>; done: boolean }) {
  const c = useTheme();
  const icon = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 0.6, 1], [0, 0.6, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(progress.get(), [0, 1], [0.5, 1], Extrapolation.CLAMP) }],
  }));
  return (
    <View style={[styles.done, { backgroundColor: done ? c.surface2 : c.positiveSoft }]}>
      <Animated.View style={icon}>
        <Icon
          name={done ? 'arrow-counter-clockwise' : 'check'}
          size={22}
          color={done ? c.ink2 : c.positive}
          weight="bold"
        />
      </Animated.View>
    </View>
  );
}

type SwipeButtonProps = { icon: IconName; label: string; color: string; bg: string; onPress: () => void };

function SwipeButton({ icon, label, color, bg, onPress }: SwipeButtonProps) {
  return (
    <Press onPress={onPress} haptic="tap" scale={0.94} accessibilityLabel={label} style={[styles.action, { backgroundColor: bg }]}>
      <Icon name={icon} size={20} color={color} weight="bold" />
      <T variant="small" color={color}>
        {label}
      </T>
    </Press>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 13,
    paddingRight: space.lg,
    paddingLeft: space.md,
    minHeight: 56,
  },
  checkSlot: { paddingTop: 1, paddingLeft: 2 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 4 },
  strike: { textDecorationLine: 'line-through' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  done: { width: 88, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row' },
  action: { width: 76, alignItems: 'center', justifyContent: 'center', gap: 4 },
});
