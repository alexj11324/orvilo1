import { type HeatmapsProps } from '@lobehub/charts';
import { Heatmaps } from '@lobehub/charts';
import { CoinsIcon, FlameIcon, MessageSquareIcon } from 'lucide-react';
import { createElement, memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useClientDataSWR } from '@/libs/swr';
import { statsKeys } from '@/libs/swr/keys';
import { messageService } from '@/services/message';
import { formatIntergerNumber, formatShortenNumber } from '@/utils/format';

import { HeatmapType } from '../../types';
import StatsFormGroup from '../components/StatsFormGroup';
import HeatmapStats from './HeatmapStats';

const AiHeatmaps = memo<Omit<HeatmapsProps, 'data' | 'ref'> & { mobile?: boolean }>(
  ({ mobile, ...rest }) => {
    const { t } = useTranslation('auth');
    const [type, setType] = useState<HeatmapType>(HeatmapType.Tokens);
    const isTokens = type === HeatmapType.Tokens;

    const { data, isLoading } = useClientDataSWR(statsKeys.heatmaps(type), async () =>
      isTokens ? messageService.getTokenHeatmaps() : messageService.getHeatmaps(),
    );

    const days = data?.filter((item) => item.level > 0).length || '--';
    const hotDays = data?.filter((item) => item.level >= 3).length || '--';

    const content = (
      <Heatmaps
        blockMargin={mobile ? 3 : undefined}
        blockRadius={mobile ? 2 : undefined}
        blockSize={mobile ? 6 : 14}
        data={data || []}
        hideTotalCount={isTokens}
        loading={isLoading || !data}
        maxLevel={4}
        customTooltip={(activity) =>
          t(isTokens ? 'heatmaps.tooltipTokens' : 'heatmaps.tooltip', {
            count: isTokens
              ? formatShortenNumber(activity.count)
              : formatIntergerNumber(activity.count),
            date: activity.date,
          })
        }
        labels={{
          legend: {
            less: t('heatmaps.legend.less'),
            more: t('heatmaps.legend.more'),
          },
          months: [
            t('heatmaps.months.jan'),
            t('heatmaps.months.feb'),
            t('heatmaps.months.mar'),
            t('heatmaps.months.apr'),
            t('heatmaps.months.may'),
            t('heatmaps.months.jun'),
            t('heatmaps.months.jul'),
            t('heatmaps.months.aug'),
            t('heatmaps.months.sep'),
            t('heatmaps.months.oct'),
            t('heatmaps.months.nov'),
            t('heatmaps.months.dec'),
          ],
          tooltip: isTokens ? t('heatmaps.tooltipTokens') : t('heatmaps.tooltip'),
          totalCount: isTokens ? t('heatmaps.totalCountTokens') : t('heatmaps.totalCount'),
        }}
        style={{
          alignSelf: 'center',
        }}
        {...rest}
      />
    );

    const typeSwitch = (
      <Tabs
        style={{ width: 'auto' }}
        value={type}
        onValueChange={(key) => setType(key as HeatmapType)}
      >
        <TabsList>
          {[
            {
              icon: createElement(CoinsIcon, {}),
              key: HeatmapType.Tokens,
              label: t('stats.tokens'),
            },
            {
              icon: createElement(MessageSquareIcon, {}),
              key: HeatmapType.Messages,
              label: t('stats.messages'),
            },
          ].map((item) => (
            <TabsTrigger key={item.key} value={item.key}>
              {item.icon}
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    );

    const dayTags = (
      <div className={'flex min-w-0'} style={{ flexDirection: 'row', gap: 8 }}>
        <Badge>{[days, t('stats.days')].join(' ')}</Badge>
        <Badge variant="success-light">
          {createElement(FlameIcon, {})}
          {[hotDays, t('stats.days')].join(' ')}
        </Badge>
      </div>
    );

    return (
      <StatsFormGroup
        afterTitle={typeSwitch}
        extra={dayTags}
        fontSize={16}
        title={t('stats.lastYearActivity')}
      >
        <HeatmapStats />
        {content}
      </StatsFormGroup>
    );
  },
);

export default AiHeatmaps;
