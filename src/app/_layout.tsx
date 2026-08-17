import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SystemUI from 'expo-system-ui';

import { ViewerOverlay } from '@/components/viewer/ViewerOverlay';
import { useClassificationStore } from '@/stores/classification';
import { useLibraryStore } from '@/stores/library';
import { ThemeProvider, useTheme } from '@/theme/context';
import { useLockedSessionStore } from '@/stores/locked-session';
import { useOnboardingStore } from '@/stores/onboarding';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function AppShell() {
  const { colors, dark } = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const refreshLibrary = useLibraryStore((s) => s.refresh);
  const onboardingCompleted = useOnboardingStore((s) => s.completed);
  const classificationEnabled = useClassificationStore((s) => s.localEnabled);
  const runIndexation = useClassificationStore((s) => s.runIndexation);

  const inPublicGroup = segments[0] === '(public)';
  const onWelcome = inPublicGroup && segments[1] === 'welcome';

  useEffect(() => {
    refreshLibrary();
    void SplashScreen.hideAsync().catch(() => undefined);
  }, [refreshLibrary]);

  // First-run gate: the welcome flow must be completed before anything else
  // is reachable. Login/register stay reachable later (settings CTA), so only
  // /welcome itself is fenced off after completion.
  useEffect(() => {
    if (!onboardingCompleted && !inPublicGroup) router.replace('/welcome');
    else if (onboardingCompleted && onWelcome) router.replace('/');
  }, [onboardingCompleted, inPublicGroup, onWelcome, router]);

  // Keep on-device labels fresh whenever the app opens with the feature on.
  useEffect(() => {
    if (onboardingCompleted && classificationEnabled) void runIndexation();
  }, [onboardingCompleted, classificationEnabled, runIndexation]);

  // Keep the system root view color in sync with the theme.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
  }, [colors.background]);

  // Relock the Locked Folder whenever the app leaves the foreground.
  useEffect(() => {
    const listener = AppState.addEventListener('change', (next) => {
      if (next !== 'active') useLockedSessionStore.getState().lock();
    });
    return () => listener.remove();
  }, []);

  // Render nothing until the gate has redirected — avoids a tabs flash on
  // first run while the welcome screen mounts.
  if (!onboardingCompleted && !inPublicGroup) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade_from_bottom',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
        <Stack.Screen name="(public)" options={{ animation: 'fade' }} />
        <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings/ai-model" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings/ai-labeling" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="album/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="labels" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="label/[label]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="locked" options={{ animation: 'fade_from_bottom' }} />
      </Stack>
      <ViewerOverlay />
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppShell />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
