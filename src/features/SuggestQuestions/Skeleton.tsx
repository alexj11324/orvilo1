'use client';

import { Skeleton as OrviloSkeleton } from '@lobehub/ui/base-ui';
import { memo } from 'react';

interface SkeletonProps {
  count?: number;
}

const Skeleton = memo<SkeletonProps>(({ count = 3 }) => {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, index) => (
        <OrviloSkeleton height={68} key={index} />
      ))}
    </div>
  );
});

export default Skeleton;
