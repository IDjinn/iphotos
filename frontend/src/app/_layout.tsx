import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import * as SystemUI from 'expo-system-ui';

import { ViewerOverlay } from '@/components/viewer/ViewerOverlay';
import { useAccountStore } from '@/stores/account';
import { useEncryptedModeStore } from '@/stores/encrypted-mode';
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
  const user = useAccountStore((s) => s.user);
  const sessionResolved = useAccountStore((s) => s.sessionResolved);

  const inPublicGroup = segments[0] === '(public)';
  const onAuthScreen = inPublicGroup &&
    (segments[1] === 'welcome' || segments[1] === 'login' || segments[1] === 'register');

  useEffect(() => {
    refreshLibrary();
    // Hydrate the persisted session (docs/plans/09-backend-api.md §4) — token
    // presence gates the app; a dead token is rejected lazily on first use.
    void useAccountStore.getState().resolveSession();
    void useEncryptedModeStore.getState().refresh();
    // Labeling moved to the backend (docs/plans/05-classificacao.md §5) — drop
    // the endpoint API key the removed on-device feature kept in the keychain.
    SecureStore.deleteItemAsync('ai-labeling.apiKey.v1').catch(() => undefined);
  }, [refreshLibrary]);

  useEffect(() => {
    if (sessionResolved) void SplashScreen.hideAsync().catch(() => undefined);
  }, [sessionResolved]);

  // Auth gate: the app requires a signed-in account. The welcome flow only
  // runs on first launch; afterwards anything outside (public) redirects to
  // /login until a session exists — covering manual sign-out, the forced
  // sign-out on refresh rejection, and deep links into protected routes.
  useEffect(() => {
    if (!onboardingCompleted && !inPublicGroup) router.replace('/welcome');
    else if (onboardingCompleted && !user && !inPublicGroup) router.replace('/login');
    else if (user && onAuthScreen) router.replace('/');
    // `segments` re-fires the gate on every navigation so a signed-out state
    // can never rest on a protected screen.
  }, [onboardingCompleted, inPublicGroup, onAuthScreen, user, segments, router]);

  // Keep the system root view color in sync with the theme.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
  }, [colors.background]);

  // Relock the Locked Folder and the encrypted offline mode whenever the app
  // leaves the foreground (both purge decrypted plaintext on lock).
  useEffect(() => {
    const listener = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        useLockedSessionStore.getState().lock();
        useEncryptedModeStore.getState().lock();
      }
    });
    return () => listener.remove();
  }, []);

  // Render nothing until the session check resolved and the gate has
  // redirected — avoids a tabs flash before the auth gate lands.
  if (!sessionResolved || (!onboardingCompleted && !inPublicGroup)) return null;

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
        <Stack.Screen name="settings/account" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings/backup" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings/encrypted-mode" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings/import-zip" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings/subscription" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="cloud-photos" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="album/[id]" options={{ animation: 'slide_from_right' }} />
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
