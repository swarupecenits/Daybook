import type { ComponentRef, ReactNode, Ref } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from './avatar';
import { Icon } from './icon';
import { Press } from './press';
import { T } from './text';
import { radius, space, useTheme } from '@/theme';

type FriendPillProps = {
  name: string;
  selected: boolean;
  onPress: () => void;
  /** Several can be picked at once: shows a tick and reads as a checkbox. */
  multiple?: boolean;
  testID?: string;
};

export function FriendPill({ name, selected, onPress, multiple = false, testID }: FriendPillProps) {
  const c = useTheme();
  return (
    <Press
      onPress={onPress}
      haptic="select"
      scale={0.95}
      accessibilityRole={multiple ? 'checkbox' : 'button'}
      aria-checked={multiple ? selected : undefined}
      aria-selected={multiple ? undefined : selected}
      accessibilityLabel={name}
      testID={testID}
      style={[styles.pill, { backgroundColor: selected ? c.ink : c.surface, borderColor: selected ? c.ink : c.line }]}>
      <Avatar name={name} size={28} />
      <T variant="calloutMedium" color={selected ? c.bg : 'ink'} numberOfLines={1} style={styles.name}>
        {name}
      </T>
      {multiple && selected ? <Icon name="check" size={14} color={c.bg} weight="bold" /> : null}
    </Press>
  );
}

type NewPillProps = {
  active: boolean;
  onPress: () => void;
  label?: string;
  accessibilityLabel?: string;
  testID?: string;
};

/** Dashed pill that starts adding someone who isn't a friend yet. */
export function NewPill({ active, onPress, label = 'New', accessibilityLabel = 'Someone new', testID }: NewPillProps) {
  const c = useTheme();
  return (
    <Press
      onPress={onPress}
      haptic="select"
      scale={0.95}
      aria-selected={active}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[
        styles.pill,
        styles.dashed,
        { backgroundColor: active ? c.ink : 'transparent', borderColor: active ? c.ink : c.lineStrong },
      ]}>
      <View style={[styles.plus, { backgroundColor: active ? c.bg : c.surface2 }]}>
        <Icon name="plus" size={13} color={active ? c.ink : c.ink2} weight="bold" />
      </View>
      <T variant="calloutMedium" color={active ? c.bg : 'ink2'}>
        {label}
      </T>
    </Press>
  );
}

type PillRowProps = {
  children: ReactNode;
  ref?: Ref<ComponentRef<typeof ScrollView>>;
  testID?: string;
};

/** Edge-to-edge horizontal strip of pills that lines up with the page margin. */
export function PillRow({ children, ref, testID }: PillRowProps) {
  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.bleed}
      contentContainerStyle={styles.row}
      testID={testID}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bleed: { marginHorizontal: -space.page },
  row: { paddingHorizontal: space.page, gap: space.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingLeft: 5,
    paddingRight: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  dashed: { borderStyle: 'dashed', paddingLeft: 9 },
  plus: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  name: { maxWidth: 150 },
});
