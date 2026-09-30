import { Skeleton } from '@lobehub/ui/base-ui';
import { memo } from 'react';

interface TaskItemSkeletonProps {
  variant?: 'compact' | 'default';
}

const TaskItemSkeleton = memo<TaskItemSkeletonProps>(({ variant = 'default' }) => {
  if (variant === 'compact') {
    return (
      <div className="flex flex-col gap-1.5 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <Skeleton height={12} style={{ minWidth: 56 }} width={56} />
          <Skeleton.Avatar shape={'circle'} size={20} />
        </div>
        <div className="flex items-start gap-1.5">
          <Skeleton.Avatar shape={'square'} size={14} style={{ borderRadius: 4, flex: 'none' }} />
          <div className="flex flex-1 flex-col gap-1" style={{ minWidth: 0 }}>
            <Skeleton height={14} />
            <Skeleton height={14} width={'55%'} />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton.Avatar shape={'square'} size={16} style={{ borderRadius: 4, flex: 'none' }} />
          <Skeleton height={12} style={{ minWidth: 40 }} width={40} />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton.Avatar shape={'circle'} size={20} />
          <Skeleton height={12} style={{ minWidth: 44 }} width={44} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2" style={{ flex: 1, minWidth: 0 }}>
          <Skeleton.Avatar shape={'square'} size={16} style={{ borderRadius: 4, flex: 'none' }} />
          <Skeleton.Avatar shape={'square'} size={16} style={{ borderRadius: 4, flex: 'none' }} />
          <Skeleton height={14} style={{ minWidth: 64 }} width={64} />
          <Skeleton height={16} style={{ minWidth: 200 }} width={200} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Skeleton.Avatar shape={'circle'} size={'small'} />
          <Skeleton height={12} style={{ minWidth: 40 }} width={40} />
        </div>
      </div>
      <Skeleton height={14} style={{ minWidth: 0 }} width={'60%'} />
    </div>
  );
});

TaskItemSkeleton.displayName = 'TaskItemSkeleton';

export default TaskItemSkeleton;
