import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from './button';
import { BrandMark } from './empty-state';
import { T } from './text';
import { authenticate, lockSupport } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { toast } from '@/stores/toast';
import { space, useTheme } from '@/theme';

export function LockScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const busy = useRef(false);
  const [label, setLabel] = useState('Unlock');
  const [problem, setProblem] = useState<string | null>(null);

  const attempt = async () => {
    if (busy.current) return;
    busy.current = true;
    const result = await authenticate();
    busy.current = false;
    if (result === 'ok') {
      haptic('success');
      useSession.getState().unlock();
    } else if (result === 'unavailable') {
      // The phone no longer has a screen lock, so there is nothing to check against.
      useSettings.getState().update({ lock: false });
      useSession.getState().unlock();
      toast({ message: 'App lock turned off — this phone has no screen lock.', icon: 'lock-open' });
    } else if (result === 'failed') {
      haptic('error');
      setProblem("That didn't match. Try again.");
    }
  };

  const prompt = useEffectEvent(() => {
    void attempt();
  });

  useEffect(() => {
    let alive = true;
    void lockSupport().then((s) => {
      if (alive && s.available) setLabel(`Unlock with ${s.label}`);
    });
    // A short delay lets iOS finish activating the app before the system prompt appears.
    const timer = setTimeout(() => prompt(), 350);
    let previous = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && previous === 'background') prompt();
      previous = next;
    });
    return () => {
      alive = false;
      clearTimeout(timer);
      sub.remove();
    };
  }, []);

  return (
    <Animated.View
      entering={FadeIn.duration(120)}
      exiting={FadeOut.duration(200)}
      accessibilityViewIsModal
      style={[styles.cover, { backgroundColor: c.bg, paddingTop: insets.top, paddingBottom: insets.bottom + space.xxl }]}>
      <View style={styles.center}>
        <BrandMark size={88} />
        <T variant="title" align="center">
          Daybook is locked
        </T>
        <T variant="callout" color="ink2" align="center">
          {problem ?? 'Your notes, tasks and money stay private.'}
        </T>
      </View>
      <Button label={label} icon="fingerprint" onPress={() => void attempt()} size="lg" full testID="unlock" />
    </Animated.View>
  );
}

/** Plain cover shown while the app is in the switcher so its contents aren't captured. */
export function PrivacyCover() {
  const c = useTheme();
  return (
    <View style={[styles.cover, styles.coverCenter, { backgroundColor: c.bg }]}>
      <BrandMark size={88} />
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { ...StyleSheet.absoluteFill, paddingHorizontal: space.page, zIndex: 100 },
  coverCenter: { alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
});
