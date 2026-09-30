import { cssVar, cx } from 'antd-style';
import { memo } from 'react';

import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { styles as briefStyles } from '@/features/DailyBrief/style';
import { RECOMMENDATION_ICON_SIZE } from '@/features/Recommendations/iconSize';

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
          className="flex flex-row items-center gap-2.5 py-[6px]"
          data-testid={'task-template-card-skeleton'}
        >
          <Skeleton
            style={{
              borderRadius: cssVar.borderRadius,
              flex: 'none',
              height: RECOMMENDATION_ICON_SIZE.compact,
              width: RECOMMENDATION_ICON_SIZE.compact,
            }}
          />
          <Skeleton style={{ height: 16, width: '70%' }} />
        </div>
      );

    return (
      <div
        data-testid={'task-template-card-skeleton'}
        style={{ borderRadius: cssVar.borderRadiusLG }}
        className={cx(
          briefStyles.card,
          styles.card,
          'rounded-md border bg-card flex flex-col gap-3 p-3',
        )}
      >
        <div className="flex flex-row items-center gap-4 justify-between">
          <div
            className="flex flex-row items-center gap-2"
            style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}
          >
            <Skeleton
              style={{
                borderRadius: cssVar.borderRadius,
                flex: 'none',
                height: RECOMMENDATION_ICON_SIZE.regular,
                width: RECOMMENDATION_ICON_SIZE.regular,
              }}
            />
            <div
              className="flex flex-row items-center flex-1 gap-1.5"
              style={{ minWidth: 0, overflow: 'hidden' }}
            >
              <Skeleton style={{ height: 20, width: 180 }} />
              <Skeleton className="rounded-full" style={{ flex: 'none', height: 12, width: 12 }} />
            </div>
          </div>

          <Skeleton className="rounded-full" style={{ flex: 'none', height: 24, width: 24 }} />
        </div>

        <Separator className="border-dashed" style={{ marginBlock: 0 }} />

        <div className="flex flex-col gap-1.5" style={{ marginBottom: 0 }}>
          {Array.from({ length: descriptionRows }, (_, i) => (
            <Skeleton
              key={i}
              style={{ height: 14, width: i === descriptionRows - 1 ? '80%' : '100%' }}
            />
          ))}
        </div>

        <div className="flex flex-row items-center gap-2 justify-between flex-wrap">
          <Skeleton style={{ height: 22, width: 72 }} />
          <Skeleton style={{ height: 32, width: 96 }} />
        </div>
      </div>
    );
  },
);

TaskTemplateCardSkeleton.displayName = 'TaskTemplateCardSkeleton';
