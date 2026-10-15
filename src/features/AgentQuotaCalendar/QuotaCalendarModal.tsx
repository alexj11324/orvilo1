'use client';

import type { QuotaLimitReading } from '@orvilo/heterogeneous-agents/quota';
import { projectWindows } from '@orvilo/heterogeneous-agents/quota';
import { ABSOLUTE_DATE_TIME_FORMAT, formatAbsoluteDateTime } from '@orvilo/utils/time';
import dayjs from 'dayjs';
import type { TFunction } from 'i18next';
import { t as i18nT } from 'i18next';
import { BanIcon, ChevronLeftIcon, ChevronRightIcon, InfoIcon, RotateCcwIcon } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { createModal, type ModalInstance } from '@/components/Modal';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { agentQuotaService } from '@/services/agentQuota';

import {
  buildBurnSeries,
  buildDailyBurn,
  buildDailyHeatLevels,
  buildDailySpend,
  buildMonthGrid,
  buildSessionGrid,
  buildWindowStats,
  currentWindow,
  dayKeyOf,
  type DaySpend,
  formatCost,
  formatTokens,
  isCalendarMonthAvailable,
  projectBurnout,
  type QuotaSeriesKey,
  type QuotaWindowSpan,
  selectQuotaAccount,
  seriesId,
  SESSION_SERIES,
  shouldShowHeatDot,
  spendInWindow,
  trackedCostOf,
  type UsageTurn,
  utilizationStatusOf,
  type WindowStat,
} from './quotaCalendarModel';

const styles = {
  calendarGrid: 'grid grid-cols-7 gap-1',
  layout:
    'grid grid-cols-2 gap-4 items-start data-[single=true]:grid-cols-1 @max-[900px]/quota-calendar:grid-cols-1',
  root: '@container/quota-calendar',
  chartFrame: 'p-1 rounded-(--radius-card) bg-fill-quaternary',
  cost: 'overflow-hidden text-xs font-semibold tabular-nums text-ellipsis whitespace-nowrap',
  dayCell:
    'relative flex flex-col justify-between min-h-17 py-1 px-1.5 rounded-(--radius-card) text-xs bg-card data-[in-month=false]:opacity-[0.35] [&_[data-day-number]]:text-muted-foreground data-[rate-limited=true]:text-destructive-text data-[rate-limited=true]:bg-destructive-wash data-[rate-limited=true]:[&_[data-day-number]]:text-inherit data-[rate-limited=true]:[&_[data-day-secondary]]:text-inherit data-[today=true]:inset-ring-1 data-[today=true]:inset-ring-primary-border',
  dayFooter: 'flex gap-1 items-end justify-between min-h-5',
  heatDot:
    'absolute inset-bs-1.5 inset-e-1.5 size-1 rounded-full opacity-[0.45] bg-success data-[heat=2]:size-1.5 data-[heat=2]:opacity-[0.65] data-[heat=3]:size-2 data-[heat=3]:opacity-[0.82] data-[heat=4]:size-2.5 data-[heat=4]:opacity-100 data-[legend=true]:relative data-[legend=true]:inset-auto data-[legend=true]:flex-none',
  legendSwatch:
    'size-2.5 rounded-(--radius-chip) bg-card data-[rate-limited=true]:bg-destructive-wash',
  capacityRing:
    'relative grid flex-none place-items-center size-13.5 text-success-text data-[status=warning]:text-warning-text data-[status=error]:text-destructive-text',
  capacityRingLabel: 'absolute text-sm font-semibold tabular-nums text-current',
  capacityRingSvg: '-rotate-90 block w-full h-full',
  statusExhausted: 'text-xs text-destructive-text',
  statusForecast: 'text-xs text-warning-text',
  statusSafe: 'text-xs text-muted-foreground',
  tokens: 'text-xs tabular-nums text-foreground-tertiary whitespace-nowrap',
  capacityFill:
    'h-full rounded-[inherit] bg-success data-[status=warning]:bg-warning data-[status=error]:bg-destructive',
  capacityTrack: 'overflow-hidden w-full h-1.25 rounded-full bg-selected',
  windowCell:
    'flex flex-col gap-1 min-w-0 min-h-14.25 p-1 rounded-(--radius-card) text-xs tabular-nums text-muted-foreground whitespace-nowrap bg-card data-[rate-limited=true]:text-destructive-text data-[rate-limited=true]:bg-destructive-wash',
  windowGrid: 'grid grid-cols-7 gap-1',
  windowListRow:
    'grid grid-cols-[minmax(0,1.1fr)_minmax(110px,1fr)_minmax(0,1fr)] gap-3 items-center min-h-8 py-1.5 px-0.5 [&:not(:last-child)]:border-be [&:not(:last-child)]:border-divider',
  sectionPanel: 'p-2.5 rounded-(--radius-card) bg-fill-quaternary',
  weekday: 'text-xs text-muted-foreground text-center',
};

const COMPACT_ACTION_SIZE = {
  blockSize: 32,
  borderRadius: 'var(--radius-button)',
  size: 16,
} as const;

type WindowRow = Awaited<ReturnType<typeof agentQuotaService.getWindows>>[number];

const toMs = (value: Date | number | string | null | undefined): number | null =>
  value == null ? null : new Date(value).getTime();

interface NormalizedWindow extends QuotaWindowSpan {
  seriesId: string;
}

interface WindowLike {
  limitType: string;
  peakUtilization: number;
  rateLimitedAt: Date | number | string | null;
  resetsAt: Date | number | string;
  scopeKey: string;
  windowStartAt: Date | number | string;
}

const normalizeWindows = (rows: WindowLike[]): NormalizedWindow[] =>
  rows.map((row) => ({
    peakUtilization: row.peakUtilization,
    rateLimitedAt: toMs(row.rateLimitedAt),
    resetsAt: toMs(row.resetsAt)!,
    seriesId: row.limitType.startsWith('weekly') ? `weekly:${row.scopeKey || ''}` : 'session:',
    windowStartAt: toMs(row.windowStartAt)!,
  }));

const CHART_W = 640;
const CHART_H = 120;
const HISTORY_DAYS = 90;
const RING_RADIUS = 22;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const xOf = (time: number, window: QuotaWindowSpan) =>
  ((time - window.windowStartAt) / (window.resetsAt - window.windowStartAt)) * CHART_W;
const yOf = (utilization: number) => CHART_H * (1 - utilization / 100);

const formatTrackedCost = (
  spend: Pick<DaySpend, 'cost' | 'hasUnpricedTurn'>,
  t: TFunction<'chat'>,
  /**
   * A day cell is one seventh of the panel: "at least $836" does not fit it as
   * the lead number, so the cell wears the bound as a suffix and keeps every
   * amount starting on the `$`.
   */
  compact = false,
) => {
  const trackedCost = trackedCostOf(spend);
  if (trackedCost.kind === 'unknown') return t('heteroAgent.claudeQuota.calendar.unpricedCost');
  if (trackedCost.kind === 'lower-bound')
    return t(
      compact
        ? 'heteroAgent.claudeQuota.calendar.partialCostCompact'
        : 'heteroAgent.claudeQuota.calendar.partialCost',
      { cost: formatCost(trackedCost.cost) },
    );
  return formatCost(trackedCost.cost);
};

/**
 * Burn-down curve for one window: actual utilization against the even-pace
 * diagonal, extended by a dashed projection at the current pace, plus what the
 * window actually cost in tokens and dollars.
 */
const BurnChart = memo<{
  now: number;
  readings: QuotaLimitReading[];
  series: QuotaSeriesKey;
  turns: UsageTurn[];
  window: QuotaWindowSpan;
}>(({ now, readings, series, turns, window }) => {
  const { t } = useTranslation('chat');

  const points = useMemo(
    () => buildBurnSeries(readings, series, window),
    [readings, series, window],
  );
  const isLive = window.resetsAt > now;
  const projection = useMemo(() => projectBurnout(points, window), [points, window]);
  const spend = useMemo(() => spendInWindow(turns, window), [turns, window]);

  const last = points.at(-1)!;
  const polyline = points.map((p) => `${xOf(p.time, window)},${yOf(p.utilization)}`).join(' ');
  const area = `M0,${CHART_H} L${polyline.replaceAll(' ', ' L')} L${xOf(last.time, window)},${CHART_H} Z`;

  const projectionEnd =
    projection.kind === 'exhaust'
      ? { time: projection.exhaustAt, utilization: 100 }
      : projection.kind === 'safe'
        ? { time: window.resetsAt, utilization: projection.projectedEndUtilization }
        : null;
  const willExhaust = projection.kind === 'exhaust';
  const exhausted = projection.kind === 'exhausted';
  const timeFormat = series.type === 'session' ? 'HH:mm' : ABSOLUTE_DATE_TIME_FORMAT;

  const statusText = !isLive
    ? t('heteroAgent.claudeQuota.calendar.pastWindow')
    : exhausted
      ? t('heteroAgent.claudeQuota.calendar.burnout.exhausted', {
          time: dayjs(window.resetsAt).format(timeFormat),
        })
      : willExhaust
        ? t('heteroAgent.claudeQuota.calendar.burnout.willExhaust', {
            time: dayjs(projection.exhaustAt).format(timeFormat),
          })
        : t('heteroAgent.claudeQuota.calendar.burnout.safe', {
            percent: Math.round(projection.projectedEndUtilization),
          });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-3 justify-between">
        <div className="flex items-center gap-2.5">
          <CapacityRing utilization={last.utilization} />
          <div className="flex flex-col gap-0.5">
            <div className="text-xs text-muted-foreground">
              {t('heteroAgent.claudeQuota.calendar.usedOfWindow')}
            </div>
            <div className="text-xs text-muted-foreground">
              {spend.tokens > 0
                ? t('heteroAgent.claudeQuota.calendar.windowSpend', {
                    // One convention for every amount on this surface; the
                    // spelled-out bound lives in the tooltips.
                    cost: formatTrackedCost(spend, t, true),
                    tokens: formatTokens(spend.tokens),
                  })
                : t('heteroAgent.claudeQuota.calendar.noLedgerSpend')}
            </div>
          </div>
        </div>
        <span
          className={
            exhausted
              ? styles.statusExhausted
              : willExhaust
                ? styles.statusForecast
                : styles.statusSafe
          }
        >
          {statusText}
        </span>
      </div>

      <div className={styles.chartFrame}>
        <svg
          height={CHART_H}
          preserveAspectRatio={'none'}
          style={{ display: 'block' }}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          width={'100%'}
        >
          {[25, 50, 75].map((u) => (
            <line
              key={u}
              stroke={'var(--divider)'}
              strokeWidth={1}
              x1={0}
              x2={CHART_W}
              y1={yOf(u)}
              y2={yOf(u)}
            />
          ))}
          {/* even pace: exactly exhausting the window at its reset */}
          <line
            stroke={'var(--foreground-quaternary)'}
            strokeDasharray={'4 4'}
            strokeWidth={1}
            x1={0}
            x2={CHART_W}
            y1={CHART_H}
            y2={0}
          />
          <path d={area} fill={'var(--success)'} opacity={0.12} />
          <polyline
            fill={'none'}
            points={polyline}
            stroke={'var(--success-text)'}
            strokeWidth={2}
          />
          {isLive && projectionEnd && (
            <line
              stroke={willExhaust ? 'var(--warning-text)' : 'var(--foreground-tertiary)'}
              strokeDasharray={'4 4'}
              strokeWidth={1.5}
              x1={xOf(last.time, window)}
              x2={xOf(projectionEnd.time, window)}
              y1={yOf(last.utilization)}
              y2={yOf(projectionEnd.utilization)}
            />
          )}
          {isLive && willExhaust && (
            <circle
              cx={xOf(projection.exhaustAt, window)}
              cy={yOf(100)}
              fill={'var(--warning-text)'}
              r={3.5}
            />
          )}
          <circle
            cx={xOf(last.time, window)}
            cy={yOf(last.utilization)}
            fill={'var(--success-text)'}
            r={3.5}
          />
        </svg>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {dayjs(window.windowStartAt).format(timeFormat)}
        </div>
        <div className="text-xs text-muted-foreground">
          {t('heteroAgent.claudeQuota.calendar.pace')}
        </div>
        <div className="text-xs text-muted-foreground">
          {dayjs(window.resetsAt).format(timeFormat)}
        </div>
      </div>
    </div>
  );
});

BurnChart.displayName = 'BurnChart';

const CapacityRing = memo<{ utilization: number }>(({ utilization }) => {
  const value = Math.min(100, Math.max(0, utilization));

  return (
    <div
      aria-label={`${Math.round(utilization)}%`}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(utilization)}
      className={styles.capacityRing}
      data-status={utilizationStatusOf(utilization)}
      role={'meter'}
    >
      <svg className={styles.capacityRingSvg} viewBox={'0 0 54 54'}>
        <circle
          cx={27}
          cy={27}
          fill={'none'}
          r={RING_RADIUS}
          stroke={'var(--selected)'}
          strokeWidth={5}
        />
        <circle
          cx={27}
          cy={27}
          fill={'none'}
          r={RING_RADIUS}
          stroke={'currentColor'}
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - value / 100)}
          strokeLinecap={'round'}
          strokeWidth={5}
        />
      </svg>
      <span className={styles.capacityRingLabel}>{Math.round(utilization)}%</span>
    </div>
  );
});

CapacityRing.displayName = 'CapacityRing';

const CapacityMeter = memo<{ utilization: number }>(({ utilization }) => (
  <div
    aria-label={`${Math.round(utilization)}%`}
    aria-valuemax={100}
    aria-valuemin={0}
    aria-valuenow={Math.round(utilization)}
    className={styles.capacityTrack}
    role={'meter'}
  >
    <div
      className={styles.capacityFill}
      data-status={utilizationStatusOf(utilization)}
      style={{ width: `${Math.min(100, Math.max(0, utilization))}%` }}
    />
  </div>
));

CapacityMeter.displayName = 'CapacityMeter';

const windowTooltip = (stat: WindowStat, t: TFunction<'chat'>) =>
  [
    `${formatAbsoluteDateTime(stat.windowStartAt)} – ${formatAbsoluteDateTime(stat.resetsAt)}`,
    t('heteroAgent.claudeQuota.calendar.windowUtilization', {
      percent: Math.round(stat.peakUtilization),
    }),
    stat.tokens > 0
      ? t('heteroAgent.claudeQuota.calendar.windowSpend', {
          cost: formatTrackedCost(stat, t),
          tokens: formatTokens(stat.tokens),
        })
      : t('heteroAgent.claudeQuota.calendar.noLedgerSpendShort'),
    stat.rateLimitedAt && t('heteroAgent.claudeQuota.calendar.rateLimited'),
  ].filter(Boolean) as string[];

const WindowHistory = memo<{
  series: QuotaSeriesKey;
  stats: WindowStat[];
}>(({ series, stats }) => {
  const { t } = useTranslation('chat');

  if (stats.length === 0) return null;

  if (series.type === 'session') {
    const latestDay = dayjs(Math.max(...stats.map((stat) => stat.windowStartAt)));
    const grid = buildSessionGrid(stats, latestDay);

    return (
      <div className={`flex flex-col gap-2 ${styles.sectionPanel}`}>
        <div className="flex items-baseline justify-between">
          <div className="text-base font-semibold">
            {t('heteroAgent.claudeQuota.calendar.sessionHistory')}
          </div>
          <div className="text-xs text-muted-foreground">
            {t('heteroAgent.claudeQuota.calendar.sessionHistoryHint')}
          </div>
        </div>
        <div className={styles.windowGrid}>
          {grid.columns.map((column) => (
            <div className={styles.weekday} key={column.key}>
              {column.date.format('dd M/D')}
            </div>
          ))}
          {Array.from({ length: grid.rowCount }, (_, row) =>
            grid.columns.map((column) => {
              const stat = column.slots[row];
              if (!stat) return <div className={styles.windowCell} key={`${column.key}-${row}`} />;

              const cell = (
                <div
                  className={styles.windowCell}
                  data-rate-limited={stat.rateLimitedAt != null}
                  key={`${column.key}-${stat.resetsAt}`}
                >
                  <div className="flex flex-col" style={{ minWidth: 0, width: '100%' }}>
                    <span>{dayjs(stat.windowStartAt).format('HH:mm')}</span>
                    <strong>{Math.round(stat.peakUtilization)}%</strong>
                  </div>
                  <CapacityMeter utilization={stat.peakUtilization} />
                </div>
              );

              return (
                <Tooltip key={`${column.key}-${stat.resetsAt}`}>
                  <TooltipTrigger render={<span>{cell}</span>} />
                  <TooltipContent>{windowTooltip(stat, t).join(' · ')}</TooltipContent>
                </Tooltip>
              );
            }),
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 ${styles.sectionPanel}`}>
      <div className="flex items-baseline justify-between">
        <div className="text-base font-semibold">
          {t('heteroAgent.claudeQuota.calendar.weeklyHistory')}
        </div>
        <div className="text-xs text-muted-foreground">
          {t('heteroAgent.claudeQuota.calendar.weeklyHistoryHint')}
        </div>
      </div>
      <div className="flex flex-col">
        {stats.map((stat) => (
          <div className={styles.windowListRow} key={stat.resetsAt}>
            <div className="flex items-baseline gap-1.5">
              <div className="text-xs whitespace-nowrap">
                {dayjs(stat.windowStartAt).format('M/D')} – {dayjs(stat.resetsAt).format('M/D')}
              </div>
              {/* Only the live window needs naming; the rest are read as history. */}
              {stat.isLive && (
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {t('heteroAgent.claudeQuota.calendar.currentWindow')}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex flex-col flex-1" style={{ minWidth: 0 }}>
                <CapacityMeter utilization={stat.peakUtilization} />
              </div>
              <div className="flex-none w-10 text-xs font-semibold tabular-nums text-right">
                {Math.round(stat.peakUtilization)}%
              </div>
            </div>
            {stat.tokens > 0 ? (
              /* The `+` is the compact bound; hovering spells it out, the way
                 the session grid already explains its own cells. */
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span>
                      <div className="text-xs text-muted-foreground text-right">
                        {formatTokens(stat.tokens)} · {formatTrackedCost(stat, t, true)}
                      </div>
                    </span>
                  }
                />
                <TooltipContent>{windowTooltip(stat, t).join(' · ')}</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span>
                      <div className="flex items-center gap-1 justify-end">
                        <InfoIcon color={'var(--foreground-tertiary)'} size={14} />
                        <div className="text-xs text-muted-foreground">
                          {t('heteroAgent.claudeQuota.calendar.noLedgerSpendShort')}
                        </div>
                      </div>
                    </span>
                  }
                />
                <TooltipContent>
                  {t('heteroAgent.claudeQuota.calendar.noLedgerSpendHint')}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

WindowHistory.displayName = 'WindowHistory';

interface QuotaCalendarProps {
  externalAccountId?: string;
}

const QuotaCalendar = memo<QuotaCalendarProps>(({ externalAccountId }) => {
  const { t } = useTranslation('chat');
  const [accountUnavailable, setAccountUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [readings, setReadings] = useState<QuotaLimitReading[]>([]);
  const [turns, setTurns] = useState<UsageTurn[]>([]);
  const [windows, setWindows] = useState<NormalizedWindow[]>([]);
  const [series, setSeries] = useState<QuotaSeriesKey>(SESSION_SERIES);
  const [month, setMonth] = useState(() => dayjs().startOf('month'));
  const now = Date.now();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const accounts = await agentQuotaService.listAccounts().catch(() => []);
      const claude = accounts.filter((a) => a.provider === 'claude-code');
      const account = selectQuotaAccount(claude, externalAccountId);
      if (!account) {
        if (!cancelled) setAccountUnavailable(true);
        return;
      }
      setAccountUnavailable(false);

      const [windowRows, snapshotSeries, usageTurns] = await Promise.all([
        agentQuotaService.getWindows(account.id, 200).catch(() => [] as WindowRow[]),
        agentQuotaService
          .listSnapshots(account.id, HISTORY_DAYS)
          .catch(() => [] as QuotaLimitReading[]),
        agentQuotaService.listUsageTurns(account.id, HISTORY_DAYS).catch(() => [] as UsageTurn[]),
      ]);
      if (cancelled) return;
      setWindows(normalizeWindows(windowRows));
      setReadings(snapshotSeries);
      setTurns(usageTurns);
    })().finally(() => setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [externalAccountId]);

  // The 5-hour session window comes first: it is the window an agent actually
  // works inside, and the one that stops a run mid-task.
  const seriesOptions = useMemo(() => {
    const scoped = [
      ...new Set(
        readings
          .filter((r) => r.limitType.startsWith('weekly') && r.scopeKey)
          .map((r) => r.scopeKey),
      ),
    ].sort();

    return [
      { label: t('heteroAgent.claudeQuota.calendar.sessionWindow'), value: 'session:' },
      { label: t('heteroAgent.quota.weekly'), value: 'weekly:' },
      ...scoped.map((key) => ({
        label: t('heteroAgent.claudeQuota.scopedWeekly', { model: key }),
        value: `weekly:${key}`,
      })),
    ];
  }, [readings, t]);

  const dailySpend = useMemo(() => buildDailySpend(turns), [turns]);
  const dailyBurn = useMemo(() => buildDailyBurn(readings, series), [readings, series]);
  const dailyHeatLevels = useMemo(
    () => buildDailyHeatLevels(dailySpend, dailyBurn),
    [dailyBurn, dailySpend],
  );

  // Re-project the persisted snapshot series so historical windows remain
  // available even when legacy millisecond-jitter rows exhaust getWindows' limit.
  const historicalWindows = useMemo(
    () => [...windows, ...normalizeWindows(projectWindows(readings))],
    [readings, windows],
  );

  const chartWindow = useMemo(() => {
    const live = currentWindow(readings, series, now);
    if (live) return live;
    const past = historicalWindows.filter((w) => w.seriesId === seriesId(series));
    return past.length > 0 ? past.reduce((a, b) => (a.resetsAt > b.resetsAt ? a : b)) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historicalWindows, readings, series]);

  const windowStats = useMemo(() => {
    const history = historicalWindows.filter((window) => window.seriesId === seriesId(series));
    return buildWindowStats(history, chartWindow, turns, now, series.type === 'session' ? 40 : 8);
    // `now` is intentionally captured when the modal opens, matching chartWindow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historicalWindows, chartWindow, turns, series]);

  // A 5-hour window resets several times a day, so a per-day reset badge would
  // fire on every cell — only the weekly windows get one.
  const resetsByDay = useMemo(() => {
    if (series.type === 'session') return new Map<string, number>();
    const map = new Map<string, number>();
    for (const w of windows) {
      if (w.seriesId !== seriesId(series)) continue;
      map.set(dayKeyOf(w.resetsAt), w.resetsAt);
    }
    if (chartWindow && chartWindow.resetsAt > now) {
      map.set(dayKeyOf(chartWindow.resetsAt), chartWindow.resetsAt);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windows, series, chartWindow]);

  const rateLimitedDays = useMemo(
    () =>
      new Set(
        windows
          .filter((w) => w.seriesId === seriesId(series) && w.rateLimitedAt != null)
          .map((w) => dayKeyOf(w.rateLimitedAt!)),
      ),
    [windows, series],
  );

  const grid = useMemo(() => buildMonthGrid(month), [month]);
  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        dayjs()
          .day((index + 1) % 7)
          .format('dd'),
      ),
    [],
  );
  const todayKey = dayKeyOf(now);
  const previousMonth = month.subtract(1, 'month');
  const nextMonth = month.add(1, 'month');

  if (loading)
    return (
      <div className="flex flex-col gap-3">
        <Skeleton style={{ height: 170 }} />
        <Skeleton style={{ height: 320 }} />
      </div>
    );

  if (readings.length === 0 && windows.length === 0)
    return (
      <div className="py-6 text-sm text-muted-foreground text-center">
        {t(
          accountUnavailable
            ? 'heteroAgent.claudeQuota.calendar.accountUnavailable'
            : 'heteroAgent.claudeQuota.calendar.empty',
        )}
      </div>
    );

  /**
   * A day is read as money first: the cost leads, the token count backs it up.
   * With no priced turn the strongest number left takes the lead instead.
   */
  const dayLabels = (spend: DaySpend | undefined, burn: number) => {
    const cost =
      spend && (spend.cost > 0 || spend.hasUnpricedTurn) ? formatTrackedCost(spend, t, true) : '';
    const tokens = spend && spend.tokens > 0 ? formatTokens(spend.tokens) : '';
    // No ledger row (usage burned outside Orvilo) but the meter still moved.
    const share = !tokens && burn > 0 ? `${Math.round(burn)}%` : '';
    const fallback = tokens || share;
    return cost ? { primary: cost, secondary: fallback } : { primary: fallback, secondary: '' };
  };

  const hasWindowColumn = Boolean(chartWindow) || windowStats.length > 0;

  return (
    <div className={styles.root}>
      <div className={styles.layout} data-single={!hasWindowColumn}>
        <div className="flex flex-col gap-4">
          {/* The series switcher heads the window column, so the calendar beside
              it starts at the body top instead of below a full-width control. */}
          <ToggleGroup
            className="rounded-(--radius-button)"
            size="compact"
            style={{ alignSelf: 'flex-start' }}
            value={[seriesId(series)]}
            onValueChange={(value) => {
              if (!value[0]) return;
              const [type, scopeKey = ''] = String(value[0]).split(':');
              setSeries({ scopeKey, type: type === 'session' ? 'session' : 'weekly' });
            }}
          >
            {seriesOptions.map((o) => (
              <ToggleGroupItem
                className="rounded-(--radius-button) transition-[color,background-color,border-color,box-shadow,opacity] aria-pressed:hover:bg-selected data-[state=on]:hover:bg-selected"
                key={o.value}
                value={o.value}
              >
                {o.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {chartWindow && (
            <BurnChart
              now={now}
              readings={readings}
              series={series}
              turns={turns}
              window={chartWindow}
            />
          )}

          <WindowHistory series={series} stats={windowStats} />
        </div>

        <div className={`flex flex-col gap-2 ${styles.sectionPanel}`}>
          <div className="flex items-center gap-1 justify-between">
            <div className="flex items-baseline gap-2">
              <div className="text-base font-semibold">
                {t('heteroAgent.claudeQuota.calendar.monthSpend')}
              </div>
              <div className="text-xs text-muted-foreground">{month.format('YYYY/MM')}</div>
            </div>
            <div className="flex gap-0.5">
              <ActionIcon
                aria-label={t('previous', { ns: 'common' })}
                disabled={!isCalendarMonthAvailable(previousMonth, now)}
                icon={ChevronLeftIcon}
                size={COMPACT_ACTION_SIZE}
                onClick={() => setMonth((m) => m.subtract(1, 'month'))}
              />
              <ActionIcon
                aria-label={t('next', { ns: 'common' })}
                disabled={!isCalendarMonthAvailable(nextMonth, now)}
                icon={ChevronRightIcon}
                size={COMPACT_ACTION_SIZE}
                onClick={() => setMonth((m) => m.add(1, 'month'))}
              />
            </div>
          </div>

          <div className={styles.calendarGrid}>
            {weekdayLabels.map((label) => (
              <div className={styles.weekday} key={label}>
                {label}
              </div>
            ))}
            {grid.map((cell) => {
              const spend = dailySpend.get(cell.key);
              const burn = dailyBurn.get(cell.key) ?? 0;
              const resetsAt = resetsByDay.get(cell.key);
              const rateLimited = rateLimitedDays.has(cell.key);
              const heatLevel = dailyHeatLevels.get(cell.key) ?? 0;
              const { primary, secondary } = dayLabels(spend, burn);
              const tooltipParts = [
                spend &&
                  spend.tokens > 0 &&
                  t('heteroAgent.claudeQuota.calendar.dayTokens', {
                    cost: formatTrackedCost(spend, t),
                    tokens: formatTokens(spend.tokens),
                  }),
                burn > 0 &&
                  t('heteroAgent.claudeQuota.calendar.dayShare', { percent: Math.round(burn) }),
                resetsAt &&
                  t('heteroAgent.claudeQuota.calendar.resetAt', {
                    time: dayjs(resetsAt).format('HH:mm'),
                  }),
                rateLimited && t('heteroAgent.claudeQuota.calendar.rateLimited'),
              ].filter(Boolean) as string[];

              const day = (
                <div
                  className={styles.dayCell}
                  data-in-month={cell.inMonth}
                  data-rate-limited={rateLimited}
                  data-today={cell.key === todayKey}
                  key={cell.key}
                >
                  <span data-day-number>{cell.date.date()}</span>
                  {shouldShowHeatDot(heatLevel, rateLimited) && (
                    <span aria-hidden className={styles.heatDot} data-heat={heatLevel} />
                  )}
                  <span className={styles.dayFooter}>
                    <span className={styles.cost}>{primary}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      {rateLimited && <BanIcon color={'var(--destructive-text)'} size={14} />}
                      {resetsAt && <RotateCcwIcon color={'var(--muted-foreground)'} size={14} />}
                    </span>
                  </span>
                  {secondary && (
                    <span data-day-secondary className={styles.tokens}>
                      {secondary}
                    </span>
                  )}
                </div>
              );

              return tooltipParts.length > 0 ? (
                <Tooltip key={cell.key}>
                  <TooltipTrigger render={<span>{day}</span>} />
                  <TooltipContent>{tooltipParts.join(' · ')}</TooltipContent>
                </Tooltip>
              ) : (
                day
              );
            })}
          </div>

          <div className="flex items-center gap-3 flex-wrap text-xs">
            <div className="flex items-center gap-1">
              <div className="text-xs text-muted-foreground">
                {t('heteroAgent.claudeQuota.calendar.legendLess')}
              </div>
              {[1, 2, 3, 4].map((level) => (
                <span
                  className={styles.heatDot}
                  data-heat={level}
                  data-legend={'true'}
                  key={level}
                />
              ))}
              <div className="text-xs text-muted-foreground">
                {t('heteroAgent.claudeQuota.calendar.legendMore')}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className={styles.legendSwatch} data-rate-limited={'true'} />
              <BanIcon color={'var(--destructive-text)'} size={14} />
              <div className="text-xs text-muted-foreground">
                {t('heteroAgent.claudeQuota.calendar.rateLimited')}
              </div>
            </div>
            {series.type !== 'session' && (
              <div className="flex items-center gap-1">
                <RotateCcwIcon color={'var(--muted-foreground)'} size={14} />
                <div className="text-xs text-muted-foreground">
                  {t('heteroAgent.claudeQuota.calendar.legendReset')}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

QuotaCalendar.displayName = 'QuotaCalendar';

/** Calling this opens the modal — `createModal` mounts immediately. */
export const openQuotaCalendarModal = (
  params: { externalAccountId?: string } = {},
): ModalInstance =>
  createModal({
    content: <QuotaCalendar externalAccountId={params.externalAccountId} />,
    footer: null,
    title: i18nT('heteroAgent.claudeQuota.calendar.title', { ns: 'chat' }),
    width: 1040,
  });

export default QuotaCalendar;
