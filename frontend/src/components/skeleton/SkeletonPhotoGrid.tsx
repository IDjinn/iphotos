import { Skeleton } from '@/components/skeleton/Skeleton';
import { Grid, GridCell, GridRow } from '@/components/skeleton/SkeletonPhotoGrid.styles';

interface SkeletonPhotoGridProps {
  /** The real grid starts at 3 columns (pinch adjusts from there). */
  columns?: number;
  rows?: number;
}

/** Loading twin of `CloudPhotoGrid` (person photos, label photos): same square
 * cell geometry so content swaps in without a layout jump. */
export function SkeletonPhotoGrid({ columns = 3, rows = 9 }: SkeletonPhotoGridProps) {
  return (
    <Grid>
      {Array.from({ length: rows }, (_, row) => (
        <GridRow key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <GridCell key={column} $columns={columns}>
              <Skeleton radius="xs" fill />
            </GridCell>
          ))}
        </GridRow>
      ))}
    </Grid>
  );
}
