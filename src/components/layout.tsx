import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from './button';
import { Press } from './press';
import { type InkColor, T } from './text';
import { goBack } from '@/lib/system';
import { elevation, radius, space, useTheme } from '@/theme';

export function Screen({ children, bg, style }: { children: ReactNode; bg?: string; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  return <View style={[{ flex: 1, backgroundColor: bg ?? c.bg }, style]}>{children}</View>;
}

/** Top inset for a screen; iOS page-sheet modals already sit below the status bar. */
export function useTopInset(modal = false): number {
  const insets = useSafeAreaInsets();
  return modal && Platform.OS === 'ios' ? 6 : insets.top;
}

type TopBarProps = {
  title?: string;
  left?: ReactNode;
  right?: ReactNode;
  modal?: boolean;
  onBack?: () => void;
  bg?: string;
};

/** Compact bar for pushed and modal screens. */
export function TopBar({ title, left, right, modal, onBack, bg }: TopBarProps) {
  const top = useTopInset(modal);
  return (
    <View style={[styles.bar, { paddingTop: top + 4, backgroundColor: bg }]}>
      <View style={styles.side}>
        {left ?? (
          <IconButton
            icon={modal ? 'x' : 'caret-left'}
            label={modal ? 'Close' : 'Back'}
            onPress={onBack ?? goBack}
            weight="bold"
            iconSize={20}
          />
        )}
      </View>
      <View style={styles.middle}>
        {title ? (
          <T variant="headline" numberOfLines={1} accessibilityRole="header">
            {title}
          </T>
        ) : null}
      </View>
      <View style={[styles.side, styles.end]}>{right}</View>
    </View>
  );
}

type PageHeaderProps = {
  label?: string;
  title: string;
  right?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Editorial header for the tab pages: mono kicker, serif title. */
export function PageHeader({ label, title, right, children, style }: PageHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ paddingTop: insets.top + 4, paddingHorizontal: space.page }, style]}>
      <View style={styles.kicker}>
        <T variant="label" color="ink3" numberOfLines={1} style={styles.flex}>
          {label ?? ''}
        </T>
        <View style={styles.actions}>{right}</View>
      </View>
      <T variant="display" accessibilityRole="header">
        {title}
      </T>
      {children}
    </View>
  );
}

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  padded?: boolean;
  bg?: string;
  accessibilityLabel?: string;
  testID?: string;
};

export function Card({ children, style, onPress, onLongPress, padded = true, bg, accessibilityLabel, testID }: CardProps) {
  const c = useTheme();
  const base = [
    styles.card,
    { backgroundColor: bg ?? c.surface, borderColor: c.line, padding: padded ? space.lg : 0 },
    elevation(c, 1),
    style,
  ];
  if (!onPress && !onLongPress) {
    return (
      <View style={base} testID={testID}>
        {children}
      </View>
    );
  }
  return (
    <Press
      onPress={onPress}
      onLongPress={onLongPress}
      scale={0.985}
      style={base}
      accessibilityLabel={accessibilityLabel}
      testID={testID}>
      {children}
    </Press>
  );
}

export function SectionLabel({
  label,
  right,
  style,
  color = 'ink3',
}: {
  label: string;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
  color?: InkColor | (string & {});
}) {
  return (
    <View style={[styles.section, style]}>
      <T variant="label" color={color} accessibilityRole="header">
        {label}
      </T>
      {right}
    </View>
  );
}

export function LinkText({
  label,
  onPress,
  color = 'accent',
  testID,
}: {
  label: string;
  onPress: () => void;
  color?: InkColor;
  testID?: string;
}) {
  return (
    <Press onPress={onPress} hitSlop={10} scale={0.95} accessibilityRole="link" testID={testID}>
      <T variant="caption" color={color}>
        {label}
      </T>
    </Press>
  );
}

export function Hairline({ style, inset = 0 }: { style?: StyleProp<ViewStyle>; inset?: number }) {
  const c = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginLeft: inset }, style]} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 6 },
  side: { minWidth: 88, flexDirection: 'row', alignItems: 'center', gap: 2 },
  end: { justifyContent: 'flex-end' },
  middle: { flex: 1, alignItems: 'center' },
  kicker: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2, marginRight: -8 },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
    marginBottom: space.sm,
  },
});
