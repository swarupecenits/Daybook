import * as ScreenCapture from 'expo-screen-capture';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';

const PRIVACY_KEY = 'daybook-privacy';

/**
 * Locks the app after it has been in the background past the grace period, hides content in the
 * app switcher, and blocks screenshots/recents previews while privacy mode is on.
 */
export function useAppLock() {
  const lock = useSettings((s) => s.lock);
  const grace = useSettings((s) => s.lockGrace);
  const privacy = useSettings((s) => s.privacy);
  const onboarded = useSettings((s) => s.onboarded);
  const native = Platform.OS !== 'web';
  const guard = native && lock && onboarded;
  const shield = native && (guard || privacy);

  useEffect(() => {
    if (!guard && !shield) return;
    let leftAt: number | null = null;
    const sub = AppState.addEventListener('change', (state) => {
      const session = useSession.getState();
      if (shield) useSession.setState({ covered: state !== 'active' });
      if (!guard) return;
      if (state === 'background') {
        if (session.away) return;
        leftAt = Date.now();
        if (grace === 0) session.lock();
      } else if (state === 'active') {
        if (leftAt !== null && Date.now() - leftAt >= grace * 1000) session.lock();
        leftAt = null;
      }
    });
    return () => {
      sub.remove();
      useSession.setState({ covered: false });
    };
  }, [guard, shield, grace]);

  useEffect(() => {
    if (!native || !privacy) return;
    const ios = Platform.OS === 'ios';
    const on = ios ? ScreenCapture.enableAppSwitcherProtectionAsync(0.8) : ScreenCapture.preventScreenCaptureAsync(PRIVACY_KEY);
    on.catch(() => {});
    return () => {
      const off = ios ? ScreenCapture.disableAppSwitcherProtectionAsync() : ScreenCapture.allowScreenCaptureAsync(PRIVACY_KEY);
      off.catch(() => {});
    };
  }, [native, privacy]);
}
