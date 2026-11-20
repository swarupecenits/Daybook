import { memo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

import { useTheme } from '@/theme';

type DayBarsProps = {
  values: readonly number[];
  /** Index drawn at full strength (e.g. today); others are softened. */
  highlight?: number;
  color: string;
  height?: number;
  accessibilityLabel?: string;
};

/** A month of daily totals as slim bars. */
function DayBarsBase({ values, highlight, color, height = 64, accessibilityLabel }: DayBarsProps) {
  const c = useTheme();
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...values);
  const gap = values.length > 20 ? 2 : 4;
  const bar = width > 0 ? (width - gap * (values.length - 1)) / values.length : 0;
  return (
    <View
      style={{ height }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}>
      {bar > 0 ? (
        <Svg width={width} height={height}>
          {values.map((v, i) => {
            const h = v > 0 ? Math.max(4, (v / max) * (height - 2)) : 2;
            return (
              <Rect
                key={i}
                x={i * (bar + gap)}
                y={height - h}
                width={bar}
                height={h}
                rx={Math.min(3, bar / 2)}
                fill={v > 0 ? color : c.line}
                opacity={highlight === undefined || i === highlight || v === 0 ? 1 : 0.5}
              />
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

export const DayBars = memo(DayBarsBase);

type Part = { key: string; value: number; color: string };

/** Proportional strip, e.g. spending by category. */
export function StackBar({ parts, height = 12, style }: { parts: readonly Part[]; height?: number; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  const total = parts.reduce((sum, p) => sum + Math.max(0, p.value), 0);
  return (
    <View style={[styles.stack, { height, borderRadius: height / 2, backgroundColor: c.surface2 }, style]}>
      {total > 0
        ? parts
            .filter((p) => p.value > 0)
            .map((p) => <View key={p.key} style={{ flex: p.value / total, backgroundColor: p.color }} />)
        : null}
    </View>
  );
}

/** Thin progress rail; animates when the value changes. Values above 1 fill and turn `over`. */
export function Meter({
  value,
  color,
  over,
  height = 6,
  style,
}: {
  value: number;
  color: string;
  over?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const clamped = Math.max(0, Math.min(1, value));
  const fill = value > 1 && over ? over : color;
  const animated = useAnimatedStyle(() => ({
    width: withTiming(`${clamped * 100}%`, { duration: 420 }),
  }));
  return (
    <View style={[{ height, borderRadius: height / 2, backgroundColor: c.surface2, overflow: 'hidden' }, style]}>
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: fill }, animated]} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { flexDirection: 'row', overflow: 'hidden', gap: 2 },
});
