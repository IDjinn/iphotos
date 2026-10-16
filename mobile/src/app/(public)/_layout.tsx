import { Stack } from 'expo-router';

/** Auth/onboarding flow shown before (and, later, after) the main tabs. */
export default function PublicLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
