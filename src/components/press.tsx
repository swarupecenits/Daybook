import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { haptic as buzz, type HapticKind } from '@/lib/haptics';
import { springs } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  haptic?: HapticKind | false;
  /** Scale while held down; 1 turns the effect off. */
  scale?: number;
};

/** Pressable with a quick spring "give" — the tactile base for every tappable surface. */
export function Press({
  haptic = false,
  scale = 0.97,
  onPressIn,
  onPressOut,
  onPress,
  style,
  disabled,
  children,
  ...rest
}: PressProps) {
  const pressed = useSharedValue(0);
  const dim = disabled ? 0.4 : 1;
  const animated = useAnimatedStyle(() => ({
    opacity: dim * (1 - 0.12 * pressed.get()),
    transform: [{ scale: 1 - (1 - scale) * pressed.get() }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      aria-disabled={!!disabled}
      disabled={disabled}
      {...rest}
      onPressIn={(e) => {
        pressed.set(withTiming(1, { duration: 70 }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.set(withSpring(0, springs.snappy));
        onPressOut?.(e);
      }}
      onPress={
        onPress
          ? (e) => {
              if (haptic) buzz(haptic);
              onPress(e);
            }
          : undefined
      }
      style={[style, animated]}>
      {children}
    </AnimatedPressable>
  );
}
