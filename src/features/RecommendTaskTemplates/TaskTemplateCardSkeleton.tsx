import { Skeleton } from '@lobehub/ui/base-ui';
import { cssVar, cx } from 'antd-style';
import { memo } from 'react';

import { Separator } from '@/components/ui/separator';
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
          <Skeleton.Avatar
            shape={'square'}
            size={RECOMMENDATION_ICON_SIZE.compact}
            style={{ borderRadius: cssVar.borderRadius, flex: 'none' }}
          />
          <Skeleton height={16} width={'70%'} />
        </div>
      );

    return (
      <div
        className={cx(briefStyles.card, styles.card)}
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
            <Skeleton.Avatar
              shape={'square'}
              size={RECOMMENDATION_ICON_SIZE.regular}
              style={{ borderRadius: cssVar.borderRadius, flex: 'none' }}
            />
            <div
              className="flex flex-row items-center flex-1 gap-1.5"
              style={{ minWidth: 0, overflow: 'hidden' }}
            >
              <Skeleton height={20} width={180} />
              <Skeleton.Avatar shape={'circle'} size={12} style={{ flex: 'none' }} />
            </div>
          </div>

          <Skeleton.Avatar shape={'circle'} size={24} style={{ flex: 'none' }} />
        </div>

        <Separator className="border-dashed" style={{ marginBlock: 0 }} />

        <Skeleton.Text fontSize={14} rows={descriptionRows} style={{ marginBottom: 0 }} />

        <div className="flex flex-row items-center gap-2 justify-between flex-wrap">
          <Skeleton height={22} width={72} />
          <Skeleton height={32} width={96} />
        </div>
      </div>
    );
  },
);

TaskTemplateCardSkeleton.displayName = 'TaskTemplateCardSkeleton';
