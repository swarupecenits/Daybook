import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Icon, type IconName } from './icon';
import { Press } from './press';
import { T } from './text';
import { radius, springs, useTheme } from '@/theme';

export type ChipTone = 'neutral' | 'accent' | 'positive' | 'negative' | 'warning';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Shows a trailing ×; tapping the chip removes it. */
  onRemove?: () => void;
  icon?: IconName;
  /** Small colour dot before the label. */
  dot?: string;
  count?: number;
  tone?: ChipTone;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
};

export function Chip({
  label,
  selected = false,
  onPress,
  onRemove,
  icon,
  dot,
  count,
  tone = 'neutral',
  size = 'md',
  style,
  accessibilityLabel,
  testID,
}: ChipProps) {
  const c = useTheme();
  const soft: Record<ChipTone, [string, string]> = {
    neutral: [c.surface2, c.ink2],
    accent: [c.accentSoft, c.accent],
    positive: [c.positiveSoft, c.positive],
    negative: [c.negativeSoft, c.negative],
    warning: [c.warningSoft, c.warning],
  };
  const [softBg, softFg] = soft[tone];
  const plain = tone === 'neutral';
  const bg = selected ? c.ink : plain ? 'transparent' : softBg;
  const fg = selected ? c.bg : softFg;
  const border = selected ? c.ink : plain ? c.lineStrong : softBg;
  const press = onPress ?? onRemove;
  const body = (
    <>
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
      {icon ? <Icon name={icon} size={size === 'sm' ? 13 : 15} color={fg} weight="bold" /> : null}
      <T variant={size === 'sm' ? 'small' : 'caption'} color={fg} numberOfLines={1}>
        {label}
      </T>
      {count !== undefined ? (
        <T variant="small" color={selected ? c.bg : c.ink3} style={styles.count}>
          {count}
        </T>
      ) : null}
      {onRemove ? <Icon name="x" size={12} color={fg} weight="bold" /> : null}
    </>
  );
  const frame = [
    styles.chip,
    { height: size === 'sm' ? 28 : 34, paddingHorizontal: size === 'sm' ? 10 : 13, backgroundColor: bg, borderColor: border },
    style,
  ];
  if (!press) {
    return (
      <View style={frame} testID={testID}>
        {body}
      </View>
    );
  }
  return (
    <Press
      onPress={press}
      haptic="select"
      scale={0.94}
      hitSlop={4}
      accessibilityLabel={accessibilityLabel ?? (onRemove ? `Remove ${label}` : label)}
      aria-selected={selected}
      testID={testID}
      style={frame}>
      {body}
    </Press>
  );
}

export type SegmentOption<V extends string> = { value: V; label: string; count?: number };

type SegmentedProps<V extends string> = {
  options: readonly SegmentOption<V>[];
  value: V;
  onChange: (value: V) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const PAD = 3;

/** Pill-shaped tab switcher with a sliding thumb. */
export function Segmented<V extends string>({ options, value, onChange, style, testID }: SegmentedProps<V>) {
  const c = useTheme();
  const [seg, setSeg] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const x = useSharedValue(0);

  useEffect(() => {
    if (seg > 0) x.set(withSpring(index * seg, springs.snappy));
  }, [index, seg, x]);

  const thumb = useAnimatedStyle(() => ({
    width: seg,
    opacity: seg > 0 ? 1 : 0,
    transform: [{ translateX: x.get() }],
  }));

  return (
    <View
      accessibilityRole="tablist"
      testID={testID}
      onLayout={(e) => {
        const next = (e.nativeEvent.layout.width - PAD * 2) / options.length;
        if (Math.abs(next - seg) > 0.5) {
          x.set(index * next);
          setSeg(next);
        }
      }}
      style={[styles.segmented, { backgroundColor: c.surface2 }, style]}>
      <Animated.View style={[styles.thumb, { backgroundColor: c.raised, borderColor: c.line }, thumb]} />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Press
            key={o.value}
            onPress={() => {
              if (!on) onChange(o.value);
            }}
            haptic={on ? false : 'select'}
            scale={0.96}
            accessibilityRole="tab"
            aria-selected={on}
            accessibilityLabel={o.count ? `${o.label}, ${o.count}` : o.label}
            testID={testID ? `${testID}-${o.value}` : undefined}
            style={styles.segment}>
            <T variant="caption" color={on ? 'ink' : 'ink3'} numberOfLines={1}>
              {o.label}
            </T>
            {o.count ? (
              <T variant="small" color={on ? 'accent' : 'ink3'} style={styles.count}>
                {o.count}
              </T>
            ) : null}
          </Press>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  count: { fontVariant: ['tabular-nums'] },
  segmented: { flexDirection: 'row', borderRadius: radius.pill, padding: PAD, height: 40 },
  thumb: {
    position: 'absolute',
    top: PAD,
    bottom: PAD,
    left: PAD,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0px 1px 3px rgba(0,0,0,0.08)',
  },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
});
