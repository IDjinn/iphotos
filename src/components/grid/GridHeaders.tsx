import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import type { PhotoAsset } from '@/data/types';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

import { PhotoCell } from './PhotoCell';

/**
 * Sticky month header: translucent surface + month name + a
 * "back to top" chevron.
 */
export function MonthHeader({ label, onBackToTop }: { label: string; onBackToTop?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.monthWrap, { backgroundColor: `${colors.background}F2` }]}>
      <ThemedText variant="titleMedium" style={styles.monthLabel}>
        {label}
      </ThemedText>
      {onBackToTop ? (
        <Pressable
          hitSlop={12}
          onPress={() => {
            haptic('light');
            onBackToTop();
          }}
          accessibilityLabel={`Jump back to ${label}`}
        >
          <Icon name="chevron-up-circle-outline" size={22} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Day group header, e.g. "Today". */
export function DayHeader({ label }: { label: string }) {
  return (
    <View style={styles.dayWrap}>
      <ThemedText variant="bodySmall" color="secondary">
        {label}
      </ThemedText>
    </View>
  );
}

/** Row of cells with a fixed gap — one FlashList item. */
export function GridRow({
  assets,
  cellSize,
  gap,
  onPress,
}: {
  assets: PhotoAsset[];
  cellSize: number;
  gap: number;
  onPress: (asset: PhotoAsset) => void;
}) {
  return (
    <View style={[styles.row, { gap, height: cellSize, marginBottom: gap }]}>
      {assets.map((asset) => (
        <PhotoCell key={asset.id} asset={asset} size={cellSize} onPress={onPress} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  monthWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  monthLabel: { fontWeight: '600' },
  dayWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  row: { flexDirection: 'row' },
});
