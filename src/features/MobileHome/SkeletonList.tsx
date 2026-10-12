'use client';

import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

interface SkeletonListProps {
  count?: number;
}

const SkeletonList = memo<SkeletonListProps>(({ count = 4 }) => {
  return (
    <div className="flex flex-col">
      {Array.from({ length: count }).map((_, index) => (
        <div
          className="flex min-h-11 items-center gap-3 rounded-(--radius-card) px-4 pbs-2.5 pbe-2.5 hover:bg-accent"
          key={index}
        >
          <Skeleton className="size-10 flex-none rounded-full motion-reduce:animate-none" />
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex w-full flex-col">
              {/* Match TopicRow's 14/22 title and 12/20 secondary line boxes. */}
              <Skeleton className="my-1 h-3.5 w-3/5 rounded-(--radius-chip) motion-reduce:animate-none" />
              <Skeleton className="my-1 h-3 w-4/5 rounded-(--radius-chip) motion-reduce:animate-none" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});

export default SkeletonList;
