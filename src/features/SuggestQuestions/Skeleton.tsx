'use client';

import { memo } from 'react';

import { Skeleton as OrviloSkeleton } from '@/components/ui/skeleton';

interface SkeletonProps {
  count?: number;
}

const Skeleton = memo<SkeletonProps>(({ count = 3 }) => {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, index) => (
        <OrviloSkeleton key={index} style={{ height: 68 }} />
      ))}
    </div>
  );
});

export default Skeleton;
