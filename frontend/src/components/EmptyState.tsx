import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme/context';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(80).springify().dampingRatio(0.8)} style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: colors.surface }]}>
        <Icon name={icon} size={32} color={colors.textSecondary} />
      </View>
      <ThemedText variant="titleMedium" style={styles.title}>
        {title}
      </ThemedText>
      {subtitle ? (
        <ThemedText variant="bodySmall" color="secondary" style={styles.subtitle}>
          {subtitle}
        </ThemedText>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', maxWidth: 260 },
});
