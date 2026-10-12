import { cn } from 'cn';
import { memo } from 'react';

import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { styles as briefStyles } from '@/features/DailyBrief/style';

import { styles } from './style';

interface TaskTemplateCardSkeletonProps {
  compact?: boolean;
  descriptionRows?: number;
}

export const TaskTemplateCardSkeleton = memo<TaskTemplateCardSkeletonProps>(
  ({ compact, descriptionRows = 1 }) => {
    if (compact)
      return (
        <div
          className="flex flex-row items-center gap-2.5 py-1.5"
          data-testid={'task-template-card-skeleton'}
        >
          <Skeleton className="size-5 flex-none rounded-(--radius-card)" />
          <Skeleton className="h-4 w-7/10" />
        </div>
      );

    return (
      <div
        data-testid={'task-template-card-skeleton'}
        className={cn(
          briefStyles.card,
          styles.card,
          'rounded-(--radius-card) border bg-card flex flex-col gap-3 p-3',
        )}
      >
        <div className="flex flex-row items-center gap-4 justify-between">
          <div className="flex min-w-0 flex-1 flex-row items-center gap-2 overflow-hidden">
            <Skeleton className="size-7 flex-none rounded-(--radius-card)" />
            <div className="flex min-w-0 flex-1 flex-row items-center gap-1.5 overflow-hidden">
              <Skeleton className="h-5 w-45" />
              <Skeleton className="size-8 flex-none rounded-(--radius-button)" />
            </div>
          </div>

          <Skeleton className="size-8 flex-none rounded-(--radius-button)" />
        </div>

        <Separator className="my-0 border-dashed" />

        <div className="mb-0 flex flex-col gap-1.5">
          {Array.from({ length: descriptionRows }, (_, i) => (
            <Skeleton
              className={cn('h-3.5', i === descriptionRows - 1 ? 'w-4/5' : 'w-full')}
              key={i}
            />
          ))}
        </div>

        <div className="flex flex-row items-center gap-2 justify-between flex-wrap">
          <Skeleton className="h-5.5 w-18" />
          <Skeleton className="h-9 w-24 rounded-(--radius-button)" />
        </div>
      </div>
    );
  },
);

TaskTemplateCardSkeleton.displayName = 'TaskTemplateCardSkeleton';
