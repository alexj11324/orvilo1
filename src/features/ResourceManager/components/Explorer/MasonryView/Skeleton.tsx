import { memo } from 'react';

interface MasonrySkeletonProps {
  columnCount: number;
}

const MasonryViewSkeleton = memo<MasonrySkeletonProps>(({ columnCount }) => {
  // Generate varying heights for more natural masonry look
  const heights = [180, 220, 200, 190, 240, 210, 200, 230, 180, 220, 210, 190];

  // Calculate number of items based on viewport and column count, minimum 6 items
  const itemCount = Math.max(Math.min(columnCount * 3, 12), 6);

  // Calculate opacity gradient from 100% to 20%
  const getOpacity = (index: number) => 1 - (index / (itemCount - 1)) * 0.8;

  return (
    <div
      className="grid gap-4 py-3 px-6"
      style={{
        gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
      }}
    >
      {Array.from({ length: itemCount }).map((_, index) => (
        <div
          className="rounded-(--radius-card) bg-fill-quaternary animate-[resource-masonry-pulse_1.5s_ease-in-out_infinite] motion-reduce:animate-none"
          data-slot="resource-masonry-skeleton"
          key={index}
          style={{
            height: heights[index % heights.length],
            opacity: getOpacity(index),
          }}
        />
      ))}
    </div>
  );
});

MasonryViewSkeleton.displayName = 'MasonryViewSkeleton';

export default MasonryViewSkeleton;
