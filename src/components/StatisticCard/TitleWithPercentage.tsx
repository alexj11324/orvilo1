import { cssVar } from 'antd-style';
import { type CSSProperties } from 'react';
import { memo } from 'react';

import { Badge } from '@/components/reui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { calcGrowthPercentage } from './growthPercentage';

interface TitleWithPercentageProps {
  count?: number;
  inverseColor?: boolean;
  prvCount?: number;
  title: string;
}

const TitleWithPercentage = memo<TitleWithPercentageProps>(
  ({ inverseColor, title, prvCount, count }) => {
    const percentage = calcGrowthPercentage(count || 0, prvCount || 0);

    const upStyle: CSSProperties = {
      color: cssVar.colorSuccess,
    };

    const downStyle: CSSProperties = {
      color: cssVar.colorWarning,
    };

    return (
      <div
        className={'flex gap-1 items-center justify-start'}
        style={{ overflow: 'hidden', position: 'inherit' }}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <h2
                className="line-clamp-1"
                style={{
                  fontSize: 'inherit',
                  fontWeight: 'inherit',
                  lineHeight: 'inherit',
                  margin: 0,
                  overflow: 'hidden',
                }}
              >
                {title}
              </h2>
            }
          />
          <TooltipContent>{title}</TooltipContent>
        </Tooltip>
        {count && prvCount && percentage && percentage !== 0 ? (
          <Badge
            variant="secondary"
            style={{
              ...(inverseColor
                ? percentage > 0
                  ? downStyle
                  : upStyle
                : percentage > 0
                  ? upStyle
                  : downStyle),
            }}
          >
            {percentage > 0 ? '+' : ''}
            {percentage.toFixed(1)}%
          </Badge>
        ) : null}
      </div>
    );
  },
);

export default TitleWithPercentage;
