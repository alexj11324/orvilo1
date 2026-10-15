'use client';

import { cn } from 'cn';
import dayjs from 'dayjs';
import { Check, Target } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { Badge } from '@/components/reui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { goalSelectors, useGoalStore } from '@/store/goal';

import { buildNorthStarCards, formatMetricValue, type NorthStarCard } from './northStar';
import Sparkline from './Sparkline';

/**
 * The goal's north-star strip: how far the *world* is from the declared
 * numbers, above the header's execution metrics (rounds / spend / duration),
 * which only say what the run cost. Clauses come from
 * `config.acceptance.metrics` — the same numbers the coordinator's measured
 * gate reads — so the strip and the acceptance verdict can never disagree
 * about what is being tracked.
 */

const styles = {
  card: 'flex-1 min-w-59 max-w-85 py-2.5 px-3.5 border border-sidebar-border rounded-(--radius-card) bg-card',
  metValue: 'text-success-text',
  stale: 'text-warning-text',
  track: 'overflow-hidden h-1 rounded-full bg-selected',
};

const MetricCard = memo<{ card: NorthStarCard }>(({ card }) => {
  const { t } = useTranslation('chat');

  const freshness =
    card.latestAt == null
      ? t('goalProcess.northStar.unmeasured')
      : t('goalProcess.northStar.lastObserved', { time: dayjs(card.latestAt).fromNow() });

  return (
    <div className={`flex flex-col gap-1.5 ${styles.card}`}>
      <div className="flex items-center gap-2 justify-between">
        <div className="truncate min-w-0 text-xs text-muted-foreground">{card.label}</div>
        <div className="flex items-center gap-1">
          {card.met && (
            <Badge size="sm" variant="success">
              <Check className="size-4" size={16} /> {t('goalProcess.northStar.met')}
            </Badge>
          )}
          {/* Recording stays available after the target is met: the world
                can regress, and a card whose only refresh path disappeared
                would stay falsely met forever. */}
        </div>
      </div>
      <div className="flex items-center gap-2 justify-between">
        <div className="flex items-baseline gap-1.5">
          <div className={cn('text-xl font-semibold', card.met ? styles.metValue : '')}>
            {formatMetricValue(card.current)}
          </div>
          <div className="text-xs text-muted-foreground">
            {t(`goalProcess.northStar.op.${card.op}` as const)} {formatMetricValue(card.target)}
            {card.unit ? ` ${card.unit}` : ''}
          </div>
        </div>
        <Sparkline met={card.met} values={card.trend} />
      </div>
      <div className={styles.track}>
        <div
          className="h-full rounded-full"
          style={{
            background: card.met ? 'var(--success)' : 'var(--info)',
            width: `${card.percent}%`,
          }}
        />
      </div>
      <div className={cn('text-xs text-muted-foreground', card.stale ? styles.stale : '')}>
        {freshness}
        {card.stale ? ` · ${t('goalProcess.northStar.staleWarning')}` : ''}
      </div>
    </div>
  );
});

MetricCard.displayName = 'NorthStarMetricCard';

interface NorthStarMetricsProps {
  goalId: string;
}

const NorthStarMetrics = memo<NorthStarMetricsProps>(({ goalId }) => {
  const { t } = useTranslation('chat');

  const snapshot = useGoalStore(goalSelectors.goalGraph(goalId));
  const useFetchGoalMetricSeries = useGoalStore((s) => s.useFetchGoalMetricSeries);
  const series = useGoalStore(goalSelectors.goalMetricSeries(goalId));

  const criteria = snapshot?.goal.config?.acceptance?.metrics;
  // Fetch only when there is something to join against — a goal without
  // declared clauses renders the guidance row and costs no series read.
  const { error, isLoading, mutate } = useFetchGoalMetricSeries(
    criteria?.length ? goalId : undefined,
  );

  const cards = useMemo(
    () => (criteria?.length ? buildNorthStarCards(criteria, series ?? []) : []),
    [criteria, series],
  );

  if (!criteria?.length)
    return (
      <div className="flex items-center gap-3" style={{ paddingBlock: 4 }}>
        <Target color={'var(--ant-color-text-quaternary)'} size={16} />
        <div className="text-sm text-muted-foreground">{t('goalProcess.northStar.emptyHint')}</div>
      </div>
    );

  if (error && !series)
    return (
      <AsyncError
        error={error}
        variant={'metric'}
        onRetry={() => {
          void mutate();
        }}
      />
    );

  // First fetch still in flight: say nothing rather than confidently claiming
  // "never measured" against an empty join — a false state, not feedback.
  if (!series && isLoading)
    return (
      <div className="flex gap-2.5">
        {criteria.map((criterion) => (
          <Skeleton key={criterion.key} style={{ height: 96, width: 236 }} />
        ))}
      </div>
    );

  return (
    <div className="flex gap-2.5 flex-wrap">
      {cards.map((card) => (
        <MetricCard card={card} key={card.key} />
      ))}
    </div>
  );
});

NorthStarMetrics.displayName = 'NorthStarMetrics';

export default NorthStarMetrics;
