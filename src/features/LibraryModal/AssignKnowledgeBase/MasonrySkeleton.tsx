import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

const styles = {
  card: 'p-4 border border-divider rounded-(--radius-card) bg-card',
  grid: 'grid gap-4 py-3',
};

interface MasonrySkeletonProps {
  columnCount: number;
}

const MasonrySkeleton = memo<MasonrySkeletonProps>(({ columnCount }) => {
  // Generate varying heights for more natural masonry look
  const heights = [160, 180, 170, 160, 190, 170, 160, 180];

  // Calculate number of items based on column count (max 2 columns for modal)
  const itemCount = Math.min(columnCount * 3, 8);

  return (
    <div
      className={styles.grid}
      style={{
        gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
      }}
    >
      {Array.from({ length: itemCount }).map((_, index) => (
        <div className={styles.card} key={index}>
          <div className="flex flex-row items-start gap-4 w-full">
            <Skeleton className="rounded-full" style={{ height: 48, width: 48 }} />
            <div
              className="flex flex-col gap-4 w-full"
              style={{ height: heights[index % heights.length] }}
            >
              <Skeleton style={{ width: '80%' }} />
              {['100%', '90%', '70%'].map((width, index) => (
                <Skeleton key={index} style={{ width }} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});

MasonrySkeleton.displayName = 'MasonrySkeleton';

export default MasonrySkeleton;
