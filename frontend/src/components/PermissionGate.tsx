import { Linking, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

interface PermissionGateProps {
  /** 'denied' shows the open-settings path; 'limited' shows "allow more". */
  status: 'denied' | 'limited';
  onRequest: () => void;
}

/** Media-library permission onboarding / recovery screen. */
export function PermissionGate({ status, onRequest }: PermissionGateProps) {
  const { colors } = useTheme();

  const openSettings = () => {
    haptic('light');
    void Linking.openSettings();
  };

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeInDown.springify().dampingRatio(0.85)} style={styles.content}>
        <View style={[styles.iconWrap, { backgroundColor: colors.surface }]}>
          <Icon name="images-outline" size={40} color={colors.accent} />
        </View>
        <ThemedText variant="title" style={styles.title}>
          {status === 'denied' ? 'Allow access to your photos' : 'Allow access to more photos'}
        </ThemedText>
        <ThemedText variant="body" color="secondary" style={styles.subtitle}>
          {status === 'denied'
            ? 'iPhotos needs permission to display your photo and video library. Everything stays on your device.'
            : 'You have granted access to a limited selection. Allow full access to see your entire library.'}
        </ThemedText>
        {status === 'denied' ? (
          <>
            <PressableScale
              style={[styles.button, { backgroundColor: colors.accent }]}
              onPress={() => {
                haptic('medium');
                onRequest();
              }}
            >
              <ThemedText variant="body" color="inverse" style={styles.buttonLabel}>
                Allow access
              </ThemedText>
            </PressableScale>
            <PressableScale style={styles.link} onPress={openSettings}>
              <ThemedText variant="bodySmall" color="accent">
                Open system settings
              </ThemedText>
            </PressableScale>
          </>
        ) : (
          <PressableScale
            style={[styles.button, { backgroundColor: colors.accent }]}
            onPress={() => {
              haptic('medium');
              onRequest();
            }}
          >
            <ThemedText variant="body" color="inverse" style={styles.buttonLabel}>
              Manage access
            </ThemedText>
          </PressableScale>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  content: { alignItems: 'center', gap: 12, maxWidth: 340 },
  iconWrap: { width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', lineHeight: 20 },
  button: { borderRadius: 24, paddingHorizontal: 32, paddingVertical: 13, marginTop: 12 },
  buttonLabel: { fontWeight: '600' },
  link: { padding: 8 },
});
