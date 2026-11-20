import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { BrandMark, Wordmark } from '@/components/empty-state';
import { Field } from '@/components/form';
import { Icon, type IconName } from '@/components/icon';
import { LinkText } from '@/components/layout';
import { T } from '@/components/text';
import { haptic } from '@/lib/haptics';
import { LIMITS } from '@/lib/limits';
import { CURRENCIES } from '@/lib/money';
import { useSettings } from '@/stores/settings';
import { radius, space, useTheme } from '@/theme';

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'notepad', title: 'Notes that keep up', body: 'Checklists, headings and #tags on soft paper colours.' },
  { icon: 'list-checks', title: 'Tasks in plain words', body: 'Type “pay rent fri 9am !!” and the date, time and priority fill in.' },
  { icon: 'handshake', title: 'Money between friends', body: 'Who owes whom, split bills, and a friendly nudge when it’s time.' },
];

export default function Onboarding() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<0 | 1>(0);
  const [name, setName] = useState(() => useSettings.getState().name);
  const [currency, setCurrency] = useState(() => useSettings.getState().currency);

  const finish = () => {
    if (useSettings.getState().update({ name: name.trim(), currency, onboarded: true })) haptic('success');
  };

  if (step === 0) {
    return (
      <View style={[styles.page, { backgroundColor: c.bg, paddingTop: insets.top + 48, paddingBottom: insets.bottom + space.lg }]}>
        <Animated.View entering={FadeInDown.duration(520)}>
          <BrandMark size={84} />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(90).duration(520)} style={styles.intro}>
          <Wordmark size={46} />
          <T variant="italic" color="ink2">
            A quiet place for the day’s notes, tasks and money.
          </T>
        </Animated.View>
        <View style={styles.features}>
          {FEATURES.map((f, i) => (
            <Animated.View key={f.title} entering={FadeInDown.delay(200 + i * 90).duration(480)} style={styles.feature}>
              <View style={[styles.featureIcon, { backgroundColor: c.surface, borderColor: c.line }]}>
                <Icon name={f.icon} size={22} color={c.ink} weight="duotone" />
              </View>
              <View style={styles.flex}>
                <T variant="headline">{f.title}</T>
                <T variant="callout" color="ink2">
                  {f.body}
                </T>
              </View>
            </Animated.View>
          ))}
        </View>
        <View style={styles.flex} />
        <Animated.View entering={FadeInDown.delay(520).duration(480)} style={styles.footer}>
          <View style={styles.privacy}>
            <Icon name="shield-check" size={18} color={c.positive} weight="duotone" />
            <T variant="small" color="ink2" style={styles.flex}>
              Everything stays on this phone. No account, no ads, no tracking.
            </T>
          </View>
          <Button label="Begin" variant="ink" size="lg" full icon="arrow-right" onPress={() => setStep(1)} testID="onboarding-begin" />
        </Animated.View>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={[styles.form, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + space.xl }]}
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}>
      <Animated.View entering={FadeInRight.duration(380)} style={styles.formInner}>
        <T variant="label" color="ink3">
          Step 2 of 2
        </T>
        <T variant="display" accessibilityRole="header">
          What should we call you?
        </T>
        <Field
          placeholder="Your first name"
          value={name}
          onChangeText={setName}
          autoFocus
          autoCapitalize="words"
          autoComplete="given-name"
          textContentType="givenName"
          maxLength={LIMITS.name}
          returnKeyType="done"
          hint="Used for greetings and in payment reminders you send. Optional."
          testID="onboarding-name"
        />
        <View style={styles.currency}>
          <T variant="label" color="ink3">
            Currency
          </T>
          <View style={styles.chips}>
            {CURRENCIES.map((cur) => (
              <Chip
                key={cur.code}
                label={cur.symbol.trim() === cur.code ? cur.code : `${cur.symbol.trim()}  ${cur.code}`}
                selected={currency === cur.code}
                onPress={() => setCurrency(cur.code)}
                accessibilityLabel={cur.name}
                testID={`currency-${cur.code}`}
              />
            ))}
          </View>
        </View>
        <View style={[styles.note, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Icon name="sparkle" size={18} color={c.accent} weight="fill" />
          <T variant="small" color="ink2" style={styles.flex}>
            Tip: the + button adds anything. Try “Rahul owes me 500 for dinner” or “call mom tomorrow 6pm”.
          </T>
        </View>
        <Button label="Open my daybook" variant="ink" size="lg" full onPress={finish} testID="onboarding-finish" />
        <View style={styles.back}>
          <LinkText label="Back" onPress={() => setStep(0)} color="ink3" />
        </View>
      </Animated.View>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1, paddingHorizontal: space.page + 4 },
  intro: { marginTop: space.xl, gap: space.sm },
  features: { marginTop: space.xxl + 8, gap: space.xl },
  feature: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { gap: space.lg },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  form: { flexGrow: 1, paddingHorizontal: space.page + 4 },
  formInner: { gap: space.lg },
  currency: { gap: space.sm, marginTop: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  note: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  back: { alignItems: 'center', marginTop: space.xs },
});
