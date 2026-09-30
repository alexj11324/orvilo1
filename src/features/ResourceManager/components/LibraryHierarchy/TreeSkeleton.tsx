'use client';

import { createStaticStyles, cx } from 'antd-style';
import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    display: flex;
    gap: 6px;
    align-items: center;

    height: 32px;
    padding-block: 4px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadiusSM};
  `,
}));

interface TreeSkeletonItemProps {
  opacity?: number;
}

const TreeSkeletonItem = memo<TreeSkeletonItemProps>(({ opacity = 1 }) => {
  return (
    <div className={cx('flex flex-row', styles.container)} style={{ opacity }}>
      <Skeleton
        style={{
          flex: 'none',
          height: 16,
          width: 16,
        }}
      />
      <Skeleton style={{ height: 16, width: `${Math.floor(Math.random() * 30 + 40)}%` }} />
    </div>
  );
});

TreeSkeletonItem.displayName = 'TreeSkeletonItem';

interface TreeSkeletonProps {
  /** Number of placeholder rows; defaults to a full sidebar's worth. */
  count?: number;
}

const TreeSkeleton = ({ count = 6 }: TreeSkeletonProps) => {
  // Calculate opacity gradient from 100% to 20%
  const getOpacity = (index: number) => (count > 1 ? 1 - (index / (count - 1)) * 0.8 : 1);

  return (
    <div className="flex flex-col gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <TreeSkeletonItem key={i} opacity={getOpacity(i)} />
      ))}
    </div>
  );
};

export default TreeSkeleton;
