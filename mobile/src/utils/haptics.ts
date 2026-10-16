import * as Haptics from 'expo-haptics';

import { useSettingsStore } from '@/stores/settings';

/**
 * Fire-and-forget haptic feedback. All haptics in the app go through
 * this helper so the settings toggle applies everywhere.
 */
export function haptic(
  type: 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error' = 'light'
): void {
  if (!useSettingsStore.getState().hapticsEnabled) return;
  const run = () => {
    switch (type) {
      case 'selection':
        return Haptics.selectionAsync();
      case 'medium':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      case 'heavy':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      case 'success':
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      case 'warning':
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      case 'error':
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      default:
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };
  run().catch(() => {
    // Haptics unavailable on this device — ignore.
  });
}
