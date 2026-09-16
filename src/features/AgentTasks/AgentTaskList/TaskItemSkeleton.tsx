import { Block, Flexbox } from '@lobehub/ui';
import { Skeleton } from '@lobehub/ui/base-ui';
import { memo } from 'react';

interface TaskItemSkeletonProps {
  variant?: 'compact' | 'default';
}

const TaskItemSkeleton = memo<TaskItemSkeletonProps>(({ variant = 'default' }) => {
  if (variant === 'compact') {
    return (
      <Block gap={6} padding={10} variant={'borderless'}>
        <Flexbox horizontal align={'center'} gap={8} justify={'space-between'}>
          <Skeleton height={12} style={{ minWidth: 56 }} width={56} />
          <Skeleton.Avatar shape={'circle'} size={20} />
        </Flexbox>
        <Flexbox horizontal align={'flex-start'} gap={6}>
          <Skeleton.Avatar shape={'square'} size={14} style={{ borderRadius: 4, flex: 'none' }} />
          <Flexbox gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Skeleton height={14} />
            <Skeleton height={14} width={'55%'} />
          </Flexbox>
        </Flexbox>
        <Flexbox horizontal align={'center'} gap={6}>
          <Skeleton.Avatar shape={'square'} size={16} style={{ borderRadius: 4, flex: 'none' }} />
          <Skeleton height={12} style={{ minWidth: 40 }} width={40} />
        </Flexbox>
        <Flexbox horizontal align={'center'} gap={8}>
          <Skeleton.Avatar shape={'circle'} size={20} />
          <Skeleton height={12} style={{ minWidth: 44 }} width={44} />
        </Flexbox>
      </Block>
    );
  }

  return (
    <Block gap={8} padding={12} variant={'borderless'}>
      <Flexbox horizontal align={'center'} gap={8} justify={'space-between'}>
        <Flexbox horizontal align={'center'} gap={8} style={{ flex: 1, minWidth: 0 }}>
          <Skeleton.Avatar shape={'square'} size={16} style={{ borderRadius: 4, flex: 'none' }} />
          <Skeleton.Avatar shape={'square'} size={16} style={{ borderRadius: 4, flex: 'none' }} />
          <Skeleton height={14} style={{ minWidth: 64 }} width={64} />
          <Skeleton height={16} style={{ minWidth: 200 }} width={200} />
        </Flexbox>
        <Flexbox horizontal align={'center'} flex={'none'} gap={8}>
          <Skeleton.Avatar shape={'circle'} size={'small'} />
          <Skeleton height={12} style={{ minWidth: 40 }} width={40} />
        </Flexbox>
      </Flexbox>
      <Skeleton height={14} style={{ minWidth: 0 }} width={'60%'} />
    </Block>
  );
});

TaskItemSkeleton.displayName = 'TaskItemSkeleton';

export default TaskItemSkeleton;
