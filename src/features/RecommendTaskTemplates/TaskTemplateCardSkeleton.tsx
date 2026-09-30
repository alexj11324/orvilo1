import { Skeleton } from '@lobehub/ui/base-ui';
import { Divider } from 'antd';
import { cssVar, cx } from 'antd-style';
import { memo } from 'react';

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
          className="flex items-center gap-2.5 py-1.5"
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
        data-testid={'task-template-card-skeleton'}
        className={cx(
          'relative flex flex-col gap-3 overflow-hidden rounded-md border p-3',
          briefStyles.card,
          styles.card,
        )}
        style={{
          background: cssVar.colorBgContainer,
          borderColor: cssVar.colorBorderSecondary,
          borderRadius: cssVar.borderRadiusLG,
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <div
            className="flex items-center gap-2"
            style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}
          >
            <Skeleton.Avatar
              shape={'square'}
              size={RECOMMENDATION_ICON_SIZE.regular}
              style={{ borderRadius: cssVar.borderRadius, flex: 'none' }}
            />
            <div
              className="flex flex-1 items-center gap-1.5"
              style={{ minWidth: 0, overflow: 'hidden' }}
            >
              <Skeleton height={20} width={180} />
              <Skeleton.Avatar shape={'circle'} size={12} style={{ flex: 'none' }} />
            </div>
          </div>

          <Skeleton.Avatar shape={'circle'} size={24} style={{ flex: 'none' }} />
        </div>

        <Divider dashed style={{ marginBlock: 0 }} />

        <Skeleton.Text fontSize={14} rows={descriptionRows} style={{ marginBottom: 0 }} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Skeleton height={22} width={72} />
          <Skeleton height={32} width={96} />
        </div>
      </div>
    );
  },
);

TaskTemplateCardSkeleton.displayName = 'TaskTemplateCardSkeleton';
