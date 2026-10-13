import { useWindowDimensions } from 'react-native';

import { Skeleton } from '@/components/skeleton/Skeleton';
import {
  AvatarSlot,
  CardSlot,
  Grid,
  GridRow,
} from '@/components/skeleton/SkeletonPeopleGrid.styles';
import { columnsFor } from '@/theme/scale';
import { useTheme } from '@/theme/context';

interface SkeletonPeopleGridProps {
  rows?: number;
}

/** Loading twin of the people grid (`app/people.tsx`): same column count and
 * card layout as the real FlatList, so content swaps in without a jump. */
export function SkeletonPeopleGrid({ rows = 3 }: SkeletonPeopleGridProps) {
  const { width } = useWindowDimensions();
  const columns = columnsFor(width);
  const { ms } = useTheme();

  return (
    <Grid>
      {Array.from({ length: rows }, (_, row) => (
        <GridRow key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <CardSlot key={column}>
              <AvatarSlot>
                <Skeleton radius="full" fill />
              </AvatarSlot>
              <Skeleton width="60%" height={ms(12)} radius="sm" />
              <Skeleton width="40%" height={ms(12)} radius="sm" />
            </CardSlot>
          ))}
        </GridRow>
      ))}
    </Grid>
  );
}
