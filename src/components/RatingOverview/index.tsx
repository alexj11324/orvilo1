'use client';

import { cssVar, useResponsive } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Progress, ProgressIndicator, ProgressTrack } from '@/components/ui/progress';
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
      <div className={mobile ? 'flex flex-col gap-8' : 'flex flex-row gap-8'}>
        <div className="flex flex-col items-center gap-1.5" style={{ minWidth: 120 }}>
          <div style={{ fontSize: 48, fontWeight: 'bold', lineHeight: 1.2 }}>
            {displayAverage.toFixed(1)}
          </div>
          <Rate value={displayAverage} />
          <div className="text-muted-foreground">
            {totalCount > 0
              ? t('skills.details.rating.totalRatings', {
                  count: formatShortenNumber(totalCount),
                } as any)
              : t('skills.details.rating.noRatings')}
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-center">
          {stars.map((star) => {
            const count = distribution?.[star] ?? 0;
            const percent = totalCount > 0 ? (count / totalCount) * 100 : 0;
            return (
              <div className="flex items-center gap-2" key={star}>
                <div className="text-muted-foreground" style={{ flexShrink: 0, width: 16 }}>
                  {star}
                </div>
                <Progress style={{ flex: 1, marginBottom: 0 }} value={percent}>
                  <ProgressTrack>
                    <ProgressIndicator style={{ background: cssVar.colorWarning }} />
                  </ProgressTrack>
                </Progress>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);

export default RatingOverview;
