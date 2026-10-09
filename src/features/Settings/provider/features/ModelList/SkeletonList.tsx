'use client';

import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

export const Placeholder = memo(() => (
  <div className="flex min-h-11 items-center justify-between gap-6 border-t border-border px-4 py-1.5 first:border-t-0">
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Skeleton className="size-8 flex-none" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Skeleton className="h-4 w-40" />
        <div className="flex gap-1">
          <Skeleton className="h-3.5 w-15" />
          <Skeleton className="h-3.5 w-10" />
        </div>
      </div>
    </div>
    <Skeleton className="h-[18px] w-8 rounded-full" />
  </div>
));

export const SkeletonList = () => (
  <div aria-hidden>
    {Array.from({ length: 6 }).map((_, i) => (
      <Placeholder key={i} />
    ))}
  </div>
);

export default SkeletonList;
