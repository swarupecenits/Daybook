import type { StyleProp, ViewStyle } from 'react-native';

import { Icon, type IconName, type IconWeight } from './icon';
import { Press } from './press';
import { T } from './text';
import type { HapticKind } from '@/lib/haptics';
import { radius, useTheme } from '@/theme';

export type ButtonVariant = 'primary' | 'ink' | 'secondary' | 'ghost' | 'danger' | 'positive';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  /** Stretch to the parent's width. */
  full?: boolean;
  haptic?: HapticKind | false;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
};

const HEIGHT = { sm: 36, md: 48, lg: 56 } as const;

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  size = 'md',
  disabled,
  full,
  haptic = 'tap',
  style,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const c = useTheme();
  const tones: Record<ButtonVariant, { bg: string; fg: string }> = {
    primary: { bg: c.accent, fg: c.onAccent },
    ink: { bg: c.ink, fg: c.bg },
    secondary: { bg: c.surface2, fg: c.ink },
    ghost: { bg: 'transparent', fg: c.accent },
    danger: { bg: c.negativeSoft, fg: c.negative },
    positive: { bg: c.positiveSoft, fg: c.positive },
  };
  const tone = tones[variant];
  // Forward arrows point onward from the words, so they follow the label.
  const trailing = icon === 'arrow-right' || icon === 'caret-right';
  const glyph = icon ? <Icon name={icon} size={size === 'sm' ? 16 : 19} color={tone.fg} weight="bold" /> : null;
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      haptic={haptic}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      style={[
        {
          height: HEIGHT[size],
          paddingHorizontal: size === 'sm' ? 14 : 22,
          borderRadius: radius.pill,
          backgroundColor: tone.bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: size === 'sm' ? 6 : 8,
          alignSelf: full ? 'stretch' : 'flex-start',
        },
        style,
      ]}>
      {trailing ? null : glyph}
      <T variant={size === 'sm' ? 'caption' : 'button'} color={tone.fg} numberOfLines={1}>
        {label}
      </T>
      {trailing ? glyph : null}
    </Press>
  );
}

type IconButtonProps = {
  icon: IconName;
  /** Spoken label; icon-only controls must have one. */
  label: string;
  onPress: () => void;
  size?: number;
  iconSize?: number;
  color?: string;
  tone?: 'plain' | 'surface' | 'accent' | 'ink';
  weight?: IconWeight;
  disabled?: boolean;
  haptic?: HapticKind | false;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function IconButton({
  icon,
  label,
  onPress,
  size = 40,
  iconSize,
  color,
  tone = 'plain',
  weight = 'regular',
  disabled,
  haptic = 'tap',
  style,
  testID,
}: IconButtonProps) {
  const c = useTheme();
  const bg = tone === 'surface' ? c.surface2 : tone === 'accent' ? c.accent : tone === 'ink' ? c.ink : 'transparent';
  const fg = color ?? (tone === 'accent' ? c.onAccent : tone === 'ink' ? c.bg : c.ink);
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      haptic={haptic}
      accessibilityLabel={label}
      hitSlop={6}
      scale={0.9}
      testID={testID}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}>
      <Icon name={icon} size={iconSize ?? Math.round(size * 0.55)} color={fg} weight={weight} />
    </Press>
  );
}
