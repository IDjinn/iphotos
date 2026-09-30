import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

interface SelectionAction {
  icon: IconName;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

interface SelectionBarProps {
  count: number;
  onExit: () => void;
  actions: SelectionAction[];
}

/**
 * Floating action bar shown while multi-select is active.
 * Slides up with a spring, count pill on the left.
 */
export function SelectionBar({ count, onExit, actions }: SelectionBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Animated.View
      entering={FadeInDown.springify().dampingRatio(0.8)}
      exiting={FadeOutDown.duration(160)}
      style={[styles.wrap, { bottom: insets.bottom + 72, backgroundColor: colors.surfaceElevated }]}
    >
      <Pressable style={styles.exit} onPress={onExit} accessibilityLabel="Exit selection">
        <Icon name="close" size={20} color={colors.textSecondary} />
      </Pressable>
      <View style={[styles.countPill, { backgroundColor: colors.accentSoft }]}>
        <ThemedText variant="bodySmall" color="accent" style={styles.count}>
          {count}
        </ThemedText>
      </View>
      <View style={styles.actions}>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            style={styles.button}
            accessibilityLabel={action.label}
            onPress={() => {
              haptic('light');
              action.onPress();
            }}
          >
            <Icon name={action.icon} size={22} color={action.destructive ? colors.danger : colors.icon} />
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    paddingHorizontal: 6,
    paddingVertical: 6,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  exit: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  countPill: { minWidth: 32, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, alignItems: 'center' },
  count: { fontWeight: '600' },
  actions: { flex: 1, flexDirection: 'row', justifyContent: 'space-evenly' },
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
