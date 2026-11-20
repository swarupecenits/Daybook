import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { T } from './text';
import { useSession } from '@/stores/session';
import { radius, space, springs, useTheme } from '@/theme';

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Extra content at the end of the title row. */
  right?: ReactNode;
  children: ReactNode;
  testID?: string;
};

/**
 * Bottom sheet on a transparent modal: springs up, drags down to dismiss, fades its backdrop.
 * Stays mounted until the exit animation finishes.
 */
export function Sheet({ visible, onClose, title, right, children, testID }: SheetProps) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screen } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  // Native modals draw above the lock screen, so step aside while the app is locked or covered.
  const hidden = useSession((s) => s.locked || s.covered);

  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const panel = useSharedValue(screen);
  const keyboard = useReanimatedKeyboardAnimation();
  const bottomInset = insets.bottom;

  useEffect(() => {
    if (visible) {
      drag.set(0);
      progress.set(withSpring(1, springs.sheet));
    } else {
      progress.set(
        withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) }, (finished) => {
          if (finished) scheduleOnRN(setMounted, false);
        }),
      );
    }
  }, [visible, progress, drag]);

  const pan = usePanGesture({
    activeOffsetY: 8,
    failOffsetX: [-24, 24],
    onUpdate: (e) => {
      'worklet';
      drag.set(Math.max(0, e.translationY));
    },
    onDeactivate: (e) => {
      'worklet';
      if (!e.canceled && (e.translationY > Math.min(140, panel.get() * 0.3) || e.velocityY > 900)) {
        scheduleOnRN(onClose);
      } else {
        drag.set(withSpring(0, springs.snappy));
      }
    },
  });

  const backdrop = useAnimatedStyle(() => {
    const h = panel.get();
    return { opacity: progress.get() * (1 - Math.min(1, drag.get() / Math.max(h, 1))) };
  });
  const sheet = useAnimatedStyle(() => ({
    // Rides above the keyboard; its height is negative while open and already covers the home indicator.
    transform: [
      { translateY: (1 - progress.get()) * (panel.get() + 40) + drag.get() + Math.min(0, keyboard.height.get() + bottomInset) },
    ],
  }));

  if (!mounted || hidden) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }, backdrop]}>
          <Pressable style={styles.root} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View
            testID={testID}
            accessibilityViewIsModal
            onLayout={(e) => panel.set(e.nativeEvent.layout.height)}
            style={[
              styles.panel,
              { backgroundColor: c.surface, borderColor: c.line, paddingBottom: insets.bottom + space.lg, maxHeight: screen - insets.top - 24 },
              sheet,
            ]}>
            <View style={[styles.grabber, { backgroundColor: c.lineStrong }]} />
            {title || right ? (
              <View style={styles.header}>
                <T variant="heading" accessibilityRole="header" style={styles.title} numberOfLines={1}>
                  {title ?? ''}
                </T>
                {right}
              </View>
            ) : null}
            {children}
            <View style={[styles.overshoot, { backgroundColor: c.surface }]} />
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingHorizontal: space.page,
    paddingTop: 10,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: space.lg, minHeight: 32 },
  title: { flex: 1 },
  overshoot: { position: 'absolute', left: 0, right: 0, top: '100%', height: 400 },
});
