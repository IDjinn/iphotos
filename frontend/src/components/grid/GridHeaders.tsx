import { Pressable } from 'react-native';

import { Icon } from '@/components/Icon';
import { DayLabel, DayWrap, MonthLabel, MonthWrap, Row } from '@/components/grid/GridHeaders.styles';
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
    <MonthWrap>
      <MonthLabel variant="titleMedium">{label}</MonthLabel>
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
    </MonthWrap>
  );
}

/** Day group header, e.g. "Today". */
export function DayHeader({ label }: { label: string }) {
  return (
    <DayWrap>
      <DayLabel variant="bodySmall" color="secondary">
        {label}
      </DayLabel>
    </DayWrap>
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
    <Row $gap={gap} $height={cellSize}>
      {assets.map((asset) => (
        <PhotoCell key={asset.id} asset={asset} size={cellSize} onPress={onPress} />
      ))}
    </Row>
  );
}
