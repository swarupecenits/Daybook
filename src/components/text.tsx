import { Text, type TextProps } from 'react-native';

import { typo, type TypeVariant, useTheme } from '@/theme';

export type InkColor =
  | 'ink'
  | 'ink2'
  | 'ink3'
  | 'accent'
  | 'positive'
  | 'negative'
  | 'warning'
  | 'onAccent'
  | 'bg';

const INKS = new Set<string>(['ink', 'ink2', 'ink3', 'accent', 'positive', 'negative', 'warning', 'onAccent', 'bg']);

export type TProps = TextProps & {
  variant?: TypeVariant;
  /** A palette ink or any colour string. */
  color?: InkColor | (string & {});
  align?: 'left' | 'center' | 'right';
};

export function T({ variant = 'body', color = 'ink', align, style, ...rest }: TProps) {
  const c = useTheme();
  const tint = INKS.has(color) ? c[color as InkColor] : color;
  return (
    <Text
      maxFontSizeMultiplier={1.4}
      {...rest}
      style={[typo[variant], { color: tint }, align ? { textAlign: align } : null, style]}
    />
  );
}
