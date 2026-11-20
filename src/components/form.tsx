import { Children, Fragment, isValidElement, useState, type ReactNode, type Ref } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';

import { Icon, type IconName } from './icon';
import { Hairline, SectionLabel } from './layout';
import { Press } from './press';
import { T } from './text';
import { radius, space, springs, typo, useTheme } from '@/theme';

/** Removes the browser focus ring; the field draws its own focus border. */
export const webInput: TextStyle | null = Platform.OS === 'web' ? ({ outlineWidth: 0 } as TextStyle) : null;

type FieldProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  hint?: string;
  error?: string | null;
  prefix?: string;
  right?: ReactNode;
  ref?: Ref<TextInputInstance>;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
};

export function Field({
  label,
  hint,
  error,
  prefix,
  right,
  ref,
  style,
  inputStyle,
  onFocus,
  onBlur,
  multiline,
  ...rest
}: FieldProps) {
  const c = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={style}>
      {label ? (
        <T variant="label" color="ink3" style={styles.label}>
          {label}
        </T>
      ) : null}
      <View
        style={[
          styles.box,
          multiline && styles.multi,
          { backgroundColor: c.surface, borderColor: error ? c.negative : focused ? c.accent : c.line },
        ]}>
        {prefix ? (
          <T variant="bodyMedium" color="ink3">
            {prefix}
          </T>
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor={c.ink3}
          selectionColor={c.accent}
          cursorColor={c.accent}
          keyboardAppearance={c.scheme}
          maxFontSizeMultiplier={1.4}
          multiline={multiline}
          accessibilityLabel={label}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            typo.body,
            styles.input,
            multiline && styles.inputMulti,
            { color: c.ink },
            webInput,
            inputStyle,
          ]}
        />
        {right}
      </View>
      {error ? (
        <T variant="small" color="negative" style={styles.hint}>
          {error}
        </T>
      ) : hint ? (
        <T variant="small" color="ink3" style={styles.hint}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

type ToggleProps = {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
  testID?: string;
};

export function Toggle({ value, onChange, label, disabled, testID }: ToggleProps) {
  const c = useTheme();
  const on = c.accent;
  const off = c.lineStrong;
  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: withSpring(value ? 20 : 0, springs.snappy) }],
  }));
  const track = useAnimatedStyle(() => ({
    backgroundColor: withTiming(value ? on : off, { duration: 160 }),
  }));
  return (
    <Press
      onPress={() => onChange(!value)}
      haptic="select"
      scale={0.92}
      hitSlop={10}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      aria-checked={value}
      aria-disabled={!!disabled}
      testID={testID}>
      <Animated.View style={[styles.track, track]}>
        <Animated.View style={[styles.knob, knob]} />
      </Animated.View>
    </Press>
  );
}

type RowProps = {
  label: string;
  icon?: IconName;
  /** Colour for the icon tile; defaults to ink on surface2. */
  tint?: string;
  detail?: string;
  value?: string;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  danger?: boolean;
  disabled?: boolean;
  testID?: string;
};

export function Row({ label, icon, tint, detail, value, right, onPress, chevron, danger, disabled, testID }: RowProps) {
  const c = useTheme();
  const ink = danger ? c.negative : c.ink;
  const body = (
    <>
      {icon ? (
        <View style={[styles.tile, { backgroundColor: danger ? c.negativeSoft : c.surface2 }]}>
          <Icon name={icon} size={18} color={danger ? c.negative : (tint ?? c.ink)} weight="bold" />
        </View>
      ) : null}
      <View style={styles.rowText}>
        <T variant="bodyMedium" color={ink} numberOfLines={1}>
          {label}
        </T>
        {detail ? (
          <T variant="small" color="ink3" numberOfLines={2}>
            {detail}
          </T>
        ) : null}
      </View>
      {value ? (
        <T variant="callout" color="ink3" numberOfLines={1} style={styles.value}>
          {value}
        </T>
      ) : null}
      {right}
      {chevron ? <Icon name="caret-right" size={16} color={c.ink3} weight="bold" /> : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} testID={testID}>
        {body}
      </View>
    );
  }
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      haptic="tap"
      scale={0.985}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      testID={testID}
      style={styles.row}>
      {body}
    </Press>
  );
}

type GroupProps = { label?: string; footer?: string; children: ReactNode; style?: StyleProp<ViewStyle> };

/** Rounded card of rows with hairline separators. */
export function Group({ label, footer, children, style }: GroupProps) {
  const c = useTheme();
  const items = Children.toArray(children);
  return (
    <View style={style}>
      {label ? <SectionLabel label={label} style={styles.groupLabel} /> : null}
      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.line }]}>
        {items.map((child, i) => (
          <Fragment key={isValidElement(child) && child.key != null ? child.key : i}>
            {i > 0 ? <Hairline inset={space.lg} /> : null}
            {child}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <T variant="small" color="ink3" style={styles.footer}>
          {footer}
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 6, marginLeft: 2 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: 14,
  },
  multi: { alignItems: 'flex-start', paddingTop: 2 },
  input: { flex: 1, paddingVertical: Platform.OS === 'ios' ? 13 : 10, minHeight: 46 },
  inputMulti: { minHeight: 96, textAlignVertical: 'top' },
  hint: { marginTop: 6, marginLeft: 2 },
  track: { width: 50, height: 30, borderRadius: 15, padding: 3 },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF', boxShadow: '0px 1px 3px rgba(0,0,0,0.25)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: space.lg, paddingVertical: 10 },
  tile: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 1 },
  value: { maxWidth: '45%' },
  groupLabel: { paddingHorizontal: 4 },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  footer: { paddingHorizontal: 4, marginTop: 8 },
});
