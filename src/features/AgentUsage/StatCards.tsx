'use client';

import { cssVar } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import StatisticCard from '@/components/StatisticCard';
import { type AgentUsageStats } from '@/types/usage/usageRecord';
import { formatNumber, formatUsageValue } from '@/utils/format';

interface StatCardsProps {
  isLoading?: boolean;
  rangeLabel: string;
  summary: AgentUsageStats['summary'];
}

const desc = (text: string) => <div className="text-[12px] text-muted-foreground">{text}</div>;

const StatCards = memo<StatCardsProps>(({ summary, isLoading, rangeLabel }) => {
  const { t } = useTranslation('spend');
  const suffix = ` · ${rangeLabel}`;

  return (
    <div
      className="grid"
      style={{ gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}
    >
      <StatisticCard
        loading={isLoading}
        title={t('usageStats.cards.cost') + suffix}
        statistic={{
          precision: 2,
          prefix: '$',
          value: formatNumber(summary.totalCost, 2),
        }}
      />
      <StatisticCard
        loading={isLoading}
        title={t('usageStats.cards.cacheSavings') + suffix}
        statistic={{
          description: desc(
            t('usageStats.cards.cacheDesc', {
              rate: String(Math.round(summary.cacheHitRate * 100)),
              read: formatUsageValue(summary.cacheReadTokens),
            }),
          ),
          precision: 2,
          prefix: '$',
          value: formatNumber(summary.cacheSavings, 2),
          valueStyle: { color: cssVar.colorSuccess },
        }}
      />
      <StatisticCard
        loading={isLoading}
        title={t('usageStats.cards.token') + suffix}
        statistic={{
          description: desc(
            t('usageStats.cards.tokenDesc', {
              input: formatUsageValue(summary.inputTokens),
              output: formatUsageValue(summary.outputTokens),
            }),
          ),
          value: formatUsageValue(summary.totalTokens),
        }}
      />
    </div>
  );
});

export default StatCards;
