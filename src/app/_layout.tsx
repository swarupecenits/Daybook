import '@/lib/web-setup';

import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { Fraunces_400Regular_Italic } from '@expo-google-fonts/fraunces/400Regular_Italic';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium';
import { useFonts } from 'expo-font';
import { type ErrorBoundaryProps, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { CrashScreen } from '@/components/crash-screen';
import { Overlays } from '@/components/overlays';
import { TAB_TOAST_OFFSET } from '@/components/tab-bar';
import { openDb } from '@/db/open';
import { useAppLock } from '@/hooks/use-app-lock';
import { setReminderOpenHandler } from '@/lib/reminders';
import { boot } from '@/stores/boot';
import { startClock } from '@/stores/clock';
import { reportWriteError } from '@/stores/persist';
import { useSettings } from '@/stores/settings';
import { navigationTheme, useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 250, fade: true });

export const unstable_settings = { anchor: '(tabs)' };

let starting: Promise<void> | null = null;

function startOnce(): Promise<void> {
  starting ??= openDb(reportWriteError).then((db) => boot(db));
  return starting;
}

type Phase = { kind: 'loading' } | { kind: 'ready' } | { kind: 'failed'; message: string };

const describe = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_400Regular_Italic,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    IBMPlexMono_500Medium,
  });
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // Fall back to system fonts rather than refusing to open.
  const settled = (fontsLoaded || !!fontError) && phase.kind !== 'loading';

  useEffect(() => {
    let alive = true;
    startOnce().then(
      () => {
        if (alive) setPhase({ kind: 'ready' });
      },
      (error: unknown) => {
        starting = null;
        if (alive) setPhase({ kind: 'failed', message: describe(error) });
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  useEffect(() => startClock(), []);

  useEffect(() => {
    if (settled) void SplashScreen.hideAsync().catch(() => {});
  }, [settled]);

  if (!settled) return null;
  if (phase.kind === 'failed') {
    return (
      <CrashScreen
        title="Daybook couldn't open its storage"
        message={phase.message}
        onRetry={() => {
          setPhase({ kind: 'loading' });
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  return <App />;
}

function App() {
  const c = useTheme();
  const onboarded = useSettings((s) => s.onboarded);
  useAppLock();

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(c.bg).catch(() => {});
  }, [c.bg]);

  useEffect(() => {
    setReminderOpenHandler((id) => router.push({ pathname: '/task/[id]', params: { id } }));
    return () => setReminderOpenHandler(null);
  }, []);

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: c.bg }]}>
      <KeyboardProvider>
        <ThemeProvider value={navigationTheme(c)}>
          <StatusBar style={c.scheme === 'dark' ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
            <Stack.Protected guard={onboarded}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="note/[id]" />
              <Stack.Screen name="person/[id]" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="trash" />
              <Stack.Screen name="search" options={{ animation: 'fade', animationDuration: 180 }} />
              <Stack.Screen name="task/[id]" options={{ presentation: 'modal' }} />
              <Stack.Screen name="entry/[id]" options={{ presentation: 'modal' }} />
              <Stack.Screen name="expense/[id]" options={{ presentation: 'modal' }} />
              <Stack.Screen name="friend/[id]" options={{ presentation: 'modal' }} />
              <Stack.Screen
                name="capture"
                options={{
                  presentation: 'transparentModal',
                  animation: 'fade',
                  animationDuration: 160,
                  contentStyle: { backgroundColor: 'transparent' },
                }}
              />
            </Stack.Protected>
            <Stack.Protected guard={!onboarded}>
              <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
            </Stack.Protected>
          </Stack>
          <Overlays toastOffset={TAB_TOAST_OFFSET} />
        </ThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <CrashScreen title="Something went wrong" message={describe(error)} onRetry={() => void retry()} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
