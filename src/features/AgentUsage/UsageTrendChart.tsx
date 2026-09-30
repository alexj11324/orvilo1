'use client';

import { BarChart, ChartTooltipFrame, ChartTooltipRow } from '@lobehub/charts';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { type AgentUsageBucket } from '@/types/usage/usageRecord';
import { formatNumber, formatTokenNumber } from '@/utils/format';

enum ShowType {
  Spend = 'spend',
  Token = 'token',
}

// Uncached input (dark) / cached input / output / cache write (light).
const COLORS = ['#1668dc', '#1677ff', '#4096ff', '#91caff'];

interface UsageTrendChartProps {
  buckets?: AgentUsageBucket[];
  isLoading?: boolean;
}

const UsageTrendChart = memo<UsageTrendChartProps>(({ buckets, isLoading }) => {
  const { t } = useTranslation('spend');
  const [type, setType] = useState<ShowType>(ShowType.Spend);

  const inputKey = t('usageStats.chart.input');
  const cachedInputKey = t('usageStats.chart.cachedInput');
  const outputKey = t('usageStats.chart.output');
  const cacheWriteKey = t('usageStats.chart.cacheWrite');

  const chartData = useMemo(
    () =>
      (buckets ?? []).map((b) => ({
        [cacheWriteKey]: type === ShowType.Spend ? b.cacheWriteCost : b.cacheWriteTokens,
        [cachedInputKey]: type === ShowType.Spend ? b.cachedInputCost : b.cachedInputTokens,
        [inputKey]: type === ShowType.Spend ? b.inputCost : b.inputTokens,
        [outputKey]: type === ShowType.Spend ? b.outputCost : b.outputTokens,
        label: b.label,
      })),
    [buckets, type, inputKey, cachedInputKey, outputKey, cacheWriteKey],
  );

  const series = useMemo(
    () =>
      [inputKey, cachedInputKey, outputKey, cacheWriteKey]
        .map((key, index) => ({ color: COLORS[index], key }))
        .filter(({ key }) => chartData.some((item) => Number(item[key]) > 0)),
    [cacheWriteKey, cachedInputKey, chartData, inputKey, outputKey],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 justify-between">
        <div className="text-[16px] font-medium">{t('usageStats.chart.title')}</div>
        <ToggleGroup
          value={[type]}
          onValueChange={(value) => value[0] && setType(value[0] as ShowType)}
        >
          <ToggleGroupItem value={ShowType.Spend}>{t('usageStats.chart.spend')}</ToggleGroupItem>
          <ToggleGroupItem value={ShowType.Token}>{t('usageStats.chart.tokens')}</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {isLoading ? (
        <Skeleton style={{ height: 320 }} />
      ) : (
        <BarChart
          showLegend
          stack
          categories={series.map(({ key }) => key)}
          colors={series.map(({ color }) => color)}
          data={chartData}
          height={320}
          index={'label'}
          customTooltip={({ active, label, payload }) => {
            if (!active || !payload) return null;

            const visibleItems = payload.filter(
              ({ value }) => typeof value === 'number' && value > 0,
            );

            return (
              <ChartTooltipFrame>
                <div className="flex flex-col py-2 px-4">
                  <p style={{ margin: 0 }}>{label}</p>
                </div>
                {visibleItems.length > 0 && (
                  <>
                    <Separator
                      className="bg-transparent border-t border-border"
                      style={{ margin: 0 }}
                    />
                    <div className="flex flex-col gap-1 py-2 px-4">
                      {visibleItems.map(({ color, name, value }) => (
                        <ChartTooltipRow
                          color={color ?? '#1668dc'}
                          key={String(name)}
                          name={String(name ?? '')}
                          value={
                            type === ShowType.Spend
                              ? `$${formatNumber(value as number, 2)}`
                              : formatTokenNumber(value as number)
                          }
                        />
                      ))}
                    </div>
                  </>
                )}
              </ChartTooltipFrame>
            );
          }}
          valueFormatter={(num: number) =>
            type === ShowType.Spend ? `$${formatNumber(num, 2)}` : formatTokenNumber(num)
          }
        />
      )}
    </div>
  );
});

export default UsageTrendChart;
