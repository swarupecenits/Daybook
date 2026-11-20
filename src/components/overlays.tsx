import { useEffect, useId } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { FadeInDown, FadeOutDown, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { Icon } from './icon';
import { LockScreen, PrivacyCover } from './lock-screen';
import { Press } from './press';
import { T } from './text';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import { palettes, radius, space, useTheme } from '@/theme';

type Host = { id: string; toasts: boolean };

/**
 * Mounted hosts, newest last. Only the newest renders: on iOS a native modal covers everything
 * drawn by the root, so each modal screen mounts its own host for toasts, the lock and the cover.
 */
const useHosts = create<{ stack: Host[] }>(() => ({ stack: [] }));

function newestToastHost(stack: readonly Host[]): string | undefined {
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i].toasts) return stack[i].id;
  return undefined;
}

type OverlaysProps = {
  /** Toast distance above the bottom safe area, e.g. to clear the tab bar. */
  toastOffset?: number;
  /**
   * Off for screens that close as they confirm something, so the toast appears once, on the
   * screen below, instead of fading out with this one and then showing again.
   */
  toasts?: boolean;
};

export function Overlays({ toastOffset = space.lg, toasts = true }: OverlaysProps) {
  const id = useId();
  useEffect(() => {
    useHosts.setState((s) => ({ stack: [...s.stack, { id, toasts }] }));
    return () => useHosts.setState((s) => ({ stack: s.stack.filter((h) => h.id !== id) }));
  }, [id, toasts]);

  const top = useHosts((s) => s.stack[s.stack.length - 1]?.id === id);
  const toastHost = useHosts((s) => newestToastHost(s.stack) === id);
  const locked = useSession((s) => s.locked);
  const covered = useSession((s) => s.covered);
  let shield: React.ReactNode = null;
  if (top && locked) shield = <LockScreen />;
  else if (top && covered) shield = <PrivacyCover />;
  return (
    <>
      {toastHost ? <ToastView offset={toastOffset} /> : null}
      {shield}
    </>
  );
}

function ToastView({ offset }: { offset: number }) {
  const c = useTheme();
  const inv = palettes[c.scheme === 'dark' ? 'light' : 'dark'];
  const insets = useSafeAreaInsets();
  const { height: keyboard } = useReanimatedKeyboardAnimation();

  const shown = useToast((s) => s.current);
  const shownId = shown?.id;
  const duration = shown ? (shown.duration ?? (shown.action ? 5000 : 2600)) : 0;
  const message = shown?.message;

  useEffect(() => {
    if (shownId === undefined) return;
    const timer = setTimeout(() => useToast.getState().hide(shownId), duration);
    return () => clearTimeout(timer);
  }, [shownId, duration]);

  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message, shownId]);

  const base = insets.bottom + offset;
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.min(0, base + keyboard.get() - space.md) }],
  }));

  const tint = shown?.tone === 'success' ? inv.positive : shown?.tone === 'danger' ? inv.negative : inv.ink2;

  return (
    <Animated.View style={[styles.wrap, { bottom: base }, lift]}>
      {shown ? (
        <Animated.View
          key={shown.id}
          entering={FadeInDown.duration(220)}
          exiting={FadeOutDown.duration(160)}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.toast, { backgroundColor: inv.raised, borderColor: inv.line }]}>
          {shown.icon ? <Icon name={shown.icon} size={18} color={tint} weight="bold" /> : null}
          <T variant="calloutMedium" color={inv.ink} style={styles.message} numberOfLines={3}>
            {shown.message}
          </T>
          {shown.action ? (
            <Press
              onPress={() => {
                useToast.getState().hide(shown.id);
                shown.action?.onPress();
              }}
              haptic="tap"
              hitSlop={10}
              accessibilityLabel={shown.action.label}
              testID="toast-action"
              style={styles.action}>
              <T variant="caption" color={inv.accent}>
                {shown.action.label}
              </T>
            </Press>
          ) : (
            <View style={styles.spacer} />
          )}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center', pointerEvents: 'box-none' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    maxWidth: 520,
    alignSelf: 'stretch',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: space.lg,
    paddingRight: 6,
    paddingVertical: 8,
    boxShadow: '0px 10px 28px rgba(0,0,0,0.22)',
  },
  message: { flex: 1, paddingVertical: 4 },
  action: { paddingHorizontal: 12, height: 36, justifyContent: 'center', borderRadius: radius.pill },
  spacer: { width: 8 },
});