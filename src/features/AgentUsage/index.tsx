'use client';

import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import AgentBreadcrumb from '@/features/AgentBreadcrumb';
import AgentProfileTabs, { AGENT_PROFILE_TABS_CENTER_STYLE } from '@/features/AgentProfileTabs';
import NavHeader from '@/features/NavHeader';
import { WorkSurface, WorkSurfaceDocument } from '@/features/WorkSurface';
import { useAgentStore } from '@/store/agent';
import { type AgentUsageGranularity } from '@/types/usage/usageRecord';

import { RANGE_DAYS, type TimeRange, useAgentUsageStats } from './hooks';
import ModelBreakdown from './ModelBreakdown';
import StatCards from './StatCards';
import UsageTrendChart from './UsageTrendChart';

const EMPTY_SUMMARY = {
  cacheHitRate: 0,
  cacheReadTokens: 0,
  cacheSavings: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalCost: 0,
  totalRequests: 0,
  totalTokens: 0,
};

const AgentUsage = memo(() => {
  const { t } = useTranslation('spend');
  const activeAgentId = useAgentStore((s) => s.activeAgentId);

  const [range, setRange] = useState<TimeRange>('30d');
  const [granularity, setGranularity] = useState<AgentUsageGranularity>('day');

  const handleGranularityChange = (nextGranularity: AgentUsageGranularity) => {
    setGranularity(nextGranularity);
    if (nextGranularity === 'week' && range === '7d') setRange('30d');
  };

  const { data, isLoading, error, mutate } = useAgentUsageStats(
    activeAgentId ?? '',
    range,
    granularity,
  );

  const rangeLabel = t('usageStats.rangeSuffix', { count: RANGE_DAYS[range] });

  // A metrics surface's failure default is a *zero-valued object*, not an empty
  // array — coercing `data?.summary ?? EMPTY_SUMMARY` renders a confident
  // "$0.00 / 0 tokens" dashboard on a 500 / offline / auth failure, indistinguishable
  // from an agent that genuinely never ran. Read `error` and, when nothing loaded,
  // render a failed metric marker + Reload instead of any aggregate. `!error` keeps
  // the genuine-zero (real empty) and real-data states as before. Gate on `!data`
  // so a background revalidate error never wipes already-shown numbers.
  const showError = !!error && !data;

  return (
    <WorkSurface>
      <NavHeader
        // No section title — the Segmented beside it names the current tab.
        left={activeAgentId ? <AgentBreadcrumb agentId={activeAgentId} /> : null}
        // `relative` anchors the absolutely-centered switcher below.
        style={{ position: 'relative' }}
        styles={{
          // Center on the header midpoint (equal gaps), not the leftover track.
          center: AGENT_PROFILE_TABS_CENTER_STYLE,
          left: { minWidth: 0, paddingInlineStart: 8 },
        }}
      >
        {activeAgentId && <AgentProfileTabs active={'statistics'} agentId={activeAgentId} />}
      </NavHeader>
      <WorkSurfaceDocument>
        <div className="flex flex-col gap-4">
          <div
            className="flex flex-col gap-4 rounded-md border border-border"
            style={{ padding: 20 }}
          >
            <div className="flex items-center gap-4 justify-between flex-wrap">
              <div className="flex items-center gap-2">
                <div className="text-[13px] text-muted-foreground">{t('usageStats.dimension')}</div>
                <ToggleGroup
                  size="sm"
                  value={[granularity]}
                  onValueChange={(v) =>
                    v[0] && handleGranularityChange(v[0] as AgentUsageGranularity)
                  }
                >
                  <ToggleGroupItem value="day">{t('usageStats.byDay')}</ToggleGroupItem>
                  <ToggleGroupItem value="week">{t('usageStats.byWeek')}</ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-[13px] text-muted-foreground">{t('usageStats.range')}</div>
                <ToggleGroup
                  size="sm"
                  value={[range]}
                  onValueChange={(v) => v[0] && setRange(v[0] as TimeRange)}
                >
                  {(granularity === 'week'
                    ? [
                        { label: '30d', value: '30d' },
                        { label: '90d', value: '90d' },
                      ]
                    : [
                        { label: '7d', value: '7d' },
                        { label: '30d', value: '30d' },
                        { label: '90d', value: '90d' },
                      ]
                  ).map((o) => (
                    <ToggleGroupItem key={o.value} value={o.value}>
                      {o.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </div>
            {showError ? (
              <AsyncError error={error} variant={'metric'} onRetry={() => mutate()} />
            ) : (
              <StatCards
                isLoading={isLoading}
                rangeLabel={rangeLabel}
                summary={data?.summary ?? EMPTY_SUMMARY}
              />
            )}
          </div>
          {!showError && (
            <>
              <div
                className="flex flex-col rounded-md border border-border"
                style={{ padding: 20 }}
              >
                <UsageTrendChart buckets={data?.buckets} isLoading={isLoading} />
              </div>
              <div
                className="flex flex-col rounded-md border border-border"
                style={{ padding: 20 }}
              >
                <ModelBreakdown isLoading={isLoading} rows={data?.byModel ?? []} />
              </div>
            </>
          )}
        </div>
      </WorkSurfaceDocument>
    </WorkSurface>
  );
});

export default AgentUsage;
