'use client';

import { Progress, Text } from '@lobehub/ui/base-ui';
import { cssVar, useResponsive } from 'antd-style';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { type SkillRatingDistribution } from '@/types/discover';
import { formatShortenNumber } from '@/utils/format';

import Rate from './Rate';

interface RatingOverviewProps {
  average?: number;
  distribution?: SkillRatingDistribution;
  totalCount?: number;
}

const RatingOverview = memo<RatingOverviewProps>(
  ({ average = 0, totalCount = 0, distribution }) => {
    const { t } = useTranslation('discover');
    const { mobile } = useResponsive();

    const displayAverage = Number(average.toFixed(1));
    const stars = [5, 4, 3, 2, 1] as const;

    return (
      <div className={cn('flex gap-8', !mobile ? 'flex-row' : 'flex-col')}>
        <div className={'flex flex-col items-center'} style={{ gap: 6, minWidth: 120 }}>
          <Text style={{ fontSize: 48, fontWeight: 'bold', lineHeight: 1.2 }}>
            {displayAverage.toFixed(1)}
          </Text>
          <Rate value={displayAverage} />
          <Text type={'secondary'}>
            {totalCount > 0
              ? t('skills.details.rating.totalRatings', {
                  count: formatShortenNumber(totalCount),
                } as any)
              : t('skills.details.rating.noRatings')}
          </Text>
        </div>
        <div className={'flex flex-col justify-center flex-1'}>
          {stars.map((star) => {
            const count = distribution?.[star] ?? 0;
            const percent = totalCount > 0 ? (count / totalCount) * 100 : 0;
            return (
              <div className={'flex gap-2 items-center'} key={star}>
                <Text style={{ flexShrink: 0, width: 16 }} type={'secondary'}>
                  {star}
                </Text>
                <Progress
                  percent={percent}
                  showInfo={false}
                  size={'small'}
                  strokeColor={cssVar.colorWarning}
                  style={{ flex: 1, marginBottom: 0 }}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);

export default RatingOverview;
