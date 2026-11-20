import { StyleSheet, Text, View } from 'react-native';

import { Button } from './button';
import { Icon, type IconName } from './icon';
import { T } from './text';
import { fonts, radius, space, useTheme } from '@/theme';

type EmptyStateProps = {
  icon: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void; icon?: IconName };
  compact?: boolean;
};

export function EmptyState({ icon, title, body, action, compact }: EmptyStateProps) {
  const c = useTheme();
  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      <View style={styles.art}>
        <View style={[styles.swipe, { backgroundColor: c.highlight }]} />
        <View style={[styles.badge, { backgroundColor: c.surface, borderColor: c.lineStrong }]}>
          <Icon name={icon} size={compact ? 24 : 30} color={c.ink} weight="duotone" />
        </View>
      </View>
      <T variant={compact ? 'headline' : 'heading'} align="center">
        {title}
      </T>
      {body ? (
        <T variant="callout" color="ink2" align="center" style={styles.body}>
          {body}
        </T>
      ) : null}
      {action ? (
        <Button
          label={action.label}
          icon={action.icon}
          onPress={action.onPress}
          variant="secondary"
          size="sm"
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

/** The "d." mark: serif d, ink-blue full stop, a swipe of highlighter. */
export function BrandMark({ size = 72 }: { size?: number }) {
  const c = useTheme();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Daybook"
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          left: size * 0.08,
          right: size * 0.1,
          top: size * 0.5,
          height: size * 0.26,
          borderRadius: size * 0.05,
          backgroundColor: c.highlight,
          transform: [{ rotate: '-7deg' }],
        }}
      />
      <Text
        allowFontScaling={false}
        style={{ fontFamily: fonts.serif, fontSize: size * 0.92, lineHeight: size * 1.05, color: c.ink, letterSpacing: -size * 0.04 }}>
        d<Text style={{ color: c.accent }}>.</Text>
      </Text>
    </View>
  );
}

export function Wordmark({ size = 34 }: { size?: number }) {
  const c = useTheme();
  return (
    <Text
      allowFontScaling={false}
      accessibilityRole="header"
      style={{ fontFamily: fonts.serif, fontSize: size, lineHeight: size * 1.15, color: c.ink, letterSpacing: -size * 0.03 }}>
      Daybook<Text style={{ color: c.accent }}>.</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: space.xxl, gap: 6 },
  compact: { paddingVertical: space.xl },
  art: { width: 84, height: 72, alignItems: 'center', justifyContent: 'center', marginBottom: space.md },
  swipe: { position: 'absolute', width: 70, height: 22, bottom: 8, borderRadius: 6, transform: [{ rotate: '-8deg' }] },
  badge: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
  },
  body: { maxWidth: 300 },
  action: { marginTop: space.md, alignSelf: 'center' },
});
