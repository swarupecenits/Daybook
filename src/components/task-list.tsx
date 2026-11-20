import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { Hairline } from './layout';
import { TaskRow } from './task-row';
import type { Task } from '@/lib/types';
import { elevation, radius, useTheme } from '@/theme';

export const listLayout = LinearTransition.springify().damping(26).stiffness(280);

type TaskListProps = {
  tasks: readonly Task[];
  showDate?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** A card of task rows; rows fade in and out and the rest glide into place. */
export function TaskList({ tasks, showDate = true, style }: TaskListProps) {
  const c = useTheme();
  if (!tasks.length) return null;
  return (
    <Animated.View layout={listLayout} style={[styles.shadow, elevation(c, 1), style]}>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
        {tasks.map((t, i) => (
          <Animated.View key={t.id} entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)} layout={listLayout}>
            {i > 0 ? <Hairline inset={50} /> : null}
            <TaskRow task={t} showDate={showDate} />
          </Animated.View>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shadow: { borderRadius: radius.lg },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
