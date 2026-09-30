import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

interface TaskItemSkeletonProps {
  variant?: 'compact' | 'default';
}

const TaskItemSkeleton = memo<TaskItemSkeletonProps>(({ variant = 'default' }) => {
  if (variant === 'compact') {
    return (
      <div className="flex flex-col gap-1.5 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <Skeleton style={{ minWidth: 56, height: 12, width: 56 }} />
          <Skeleton className="rounded-full shrink-0" style={{ width: 20, height: 20 }} />
        </div>
        <div className="flex items-start gap-1.5">
          <Skeleton
            className="rounded-md shrink-0"
            style={{ borderRadius: 4, flex: 'none', width: 14, height: 14 }}
          />
          <div className="flex flex-1 flex-col gap-1" style={{ minWidth: 0 }}>
            <Skeleton style={{ height: 14 }} />
            <Skeleton style={{ height: 14, width: '55%' }} />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton
            className="rounded-md shrink-0"
            style={{ borderRadius: 4, flex: 'none', width: 16, height: 16 }}
          />
          <Skeleton style={{ minWidth: 40, height: 12, width: 40 }} />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="rounded-full shrink-0" style={{ width: 20, height: 20 }} />
          <Skeleton style={{ minWidth: 44, height: 12, width: 44 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2" style={{ flex: 1, minWidth: 0 }}>
          <Skeleton
            className="rounded-md shrink-0"
            style={{ borderRadius: 4, flex: 'none', width: 16, height: 16 }}
          />
          <Skeleton
            className="rounded-md shrink-0"
            style={{ borderRadius: 4, flex: 'none', width: 16, height: 16 }}
          />
          <Skeleton style={{ minWidth: 64, height: 14, width: 64 }} />
          <Skeleton style={{ minWidth: 200, height: 16, width: 200 }} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Skeleton className="rounded-full shrink-0" style={{ width: 'small', height: 'small' }} />
          <Skeleton style={{ minWidth: 40, height: 12, width: 40 }} />
        </div>
      </div>
      <Skeleton style={{ minWidth: 0, height: 14, width: '60%' }} />
    </div>
  );
});

TaskItemSkeleton.displayName = 'TaskItemSkeleton';

export default TaskItemSkeleton;
