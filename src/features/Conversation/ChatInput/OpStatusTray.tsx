'use client';

import { formatElapsedClockTime } from '@orvilo/utils';
import { cn } from 'cn';
import type { LucideIcon } from 'lucide-react';
import { CircleDollarSignIcon, CoinsIcon, FootprintsIcon } from 'lucide-react';
import { createElement, Fragment, memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'react-responsive';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useChatStore } from '@/store/chat';
import { operationSelectors } from '@/store/chat/selectors';
import { AI_RUNTIME_OPERATION_TYPES } from '@/store/chat/slices/operation/types';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';
import { calculateOperationUsageMetrics } from '@/utils/operationUsageMetrics';

import { contextSelectors, dataSelectors, useConversationStore } from '../store';
import { type ActivityKey, resolveOperationActivity } from '../utils/operationActivity';
import { parseStatusPhrases, pickRotatingStatusPhrase } from './OpStatusTray/logic';

// Cycle the generating phrase like a carousel so a long-running task doesn't
// stare back with the same line the whole time.
const STATUS_PHRASE_ROTATION_MS = 4000;

const styles = {
  container: '[container-type:inline-size] py-2 px-3.5 text-xs text-muted-foreground',
  containerChrome:
    'border border-divider border-be-0 rounded-ss-(--radius-card) rounded-se-(--radius-card) bg-card',
  containerTopAttached: 'rounded-ss-none rounded-se-none',
  containerSeamless: 'border-bs border-divider rounded-none bg-transparent',
  divider: 'w-px h-3 bg-divider',
  metric: 'inline-flex gap-1 items-center tabular-nums whitespace-nowrap',
  metricGroup: 'inline-flex flex-none gap-2.5 items-center',
  metricGroupFull: '[@container(width<=360px)]:hidden',
  metricIcon: 'flex-none text-foreground-tertiary',
  metricPopover: 'min-w-37.5 p-0.5',
  metricPopoverLabel: 'text-foreground-tertiary',
  metricPopoverRow: 'text-xs',
  metricPopoverValue: 'tabular-nums text-muted-foreground',
  metricValue: 'overflow-hidden max-w-14 text-ellipsis',
  compactMetric: 'cursor-default hidden flex-none [@container(width<=360px)]:inline-flex',
  statusMetric: 'overflow-hidden [flex:1_1_auto] min-w-0',
  statusText: 'overflow-hidden text-sm font-medium text-ellipsis whitespace-nowrap',
  statusPhrase: 'inline-block',
  statusPhraseMotion:
    'animate-[op-status-tray-phrase-enter_var(--orvilo-motion-mid)_ease] motion-reduce:animate-none',
  timerValue: 'flex-none text-foreground-tertiary [@container(width<=260px)]:hidden',
  activityGlyph: 'overflow-visible flex-none size-4 text-primary-text',
  glyphCore: 'origin-center [transform-box:fill-box] fill-current',
  glyphCoreMotion:
    'animate-[op-status-tray-glyph-core_1.5s_ease-in-out_infinite] motion-reduce:animate-none',
  glyphOrbit:
    'origin-center [transform-box:fill-box] fill-none [stroke:color-mix(in_srgb,currentColor_76%,transparent)] [stroke-dasharray:9_18] [stroke-linecap:round] [stroke-width:1.5]',
  glyphOrbitMotion:
    'animate-[op-status-tray-glyph-spin_2s_linear_infinite] motion-reduce:animate-none',
};

const ActivityGlyph = ({ motionEnabled }: { motionEnabled: boolean }) => (
  <svg aria-hidden className={styles.activityGlyph} viewBox="0 0 16 16">
    {createElement('circle', {
      className: cn(styles.glyphOrbit, motionEnabled && styles.glyphOrbitMotion),
      cx: '8',
      cy: '8',
      r: '6.1',
    })}
    {createElement('circle', {
      className: cn(styles.glyphCore, motionEnabled && styles.glyphCoreMotion),
      cx: '8',
      cy: '8',
      r: '2.7',
    })}
  </svg>
);

const formatTokens = (n: number) => {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
};

const formatCost = (cost: number) => {
  if (cost < 0.01) return cost.toFixed(4);
  return cost.toFixed(2);
};

const normalizeStepCount = (stepCount: unknown) => {
  if (typeof stepCount !== 'number' || !Number.isFinite(stepCount)) return 0;
  return Math.max(0, Math.floor(stepCount));
};

interface OpStatusTrayProps {
  /**
   * Drop the card chrome (background, border, rounded corners) so the status
   * reads as a plain inline row — used when nothing is flush below it to attach to.
   */
  seamless?: boolean;
  /**
   * Square the top corners when another panel sits flush above this one.
   */
  topAttached?: boolean;
}

interface MetricItem {
  icon: LucideIcon;
  key: 'cost' | 'steps' | 'tokens';
  label: string;
  title: string;
  value: string;
}

const OpStatusTray = memo<OpStatusTrayProps>(({ seamless, topAttached }) => {
  const { t } = useTranslation(['chat', 'opStatusTray']);
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  // Phrase rotation is decorative. Elapsed time and usage keep updating below.
  const reducedMotion = useMediaQuery({ query: '(prefers-reduced-motion: reduce)' });
  const phraseMotionEnabled = animationMode !== 'disabled' && !reducedMotion;
  const context = useConversationStore(contextSelectors.context);
  const dbMessages = useConversationStore(dataSelectors.dbMessages);

  const operationState = useChatStore((s) => {
    const ops = operationSelectors.getOperationsByContext(context)(s);
    let activity: ActivityKey | undefined;
    let earliestStart: number | undefined;
    let latestActivityStart = -1;
    let statusSeed: string | undefined;
    let stepCount = 0;
    const runtimeOperationIds: string[] = [];

    for (const op of ops) {
      if (op.status !== 'running' || op.metadata.isAborting || op.metadata.visibleLoadingDone)
        continue;

      const mapped = resolveOperationActivity(op.type);
      if (mapped && op.metadata.startTime > latestActivityStart) {
        latestActivityStart = op.metadata.startTime;
        activity = mapped;
      }

      if (!AI_RUNTIME_OPERATION_TYPES.includes(op.type)) {
        continue;
      }

      runtimeOperationIds.push(op.id);
      stepCount = Math.max(stepCount, normalizeStepCount(op.metadata.stepCount));

      if (earliestStart === undefined || op.metadata.startTime < earliestStart) {
        earliestStart = op.metadata.startTime;
        statusSeed = op.id;
      }
    }
    return {
      activity: activity ?? 'generating',
      operationIdsKey: runtimeOperationIds.join('|'),
      startTime: earliestStart,
      statusSeed,
      steps: stepCount,
    };
  });
  const operationsByMessage = useChatStore((s) => s.operationsByMessage);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!operationState.startTime) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [operationState.startTime]);

  const operationIds = useMemo(
    () => new Set(operationState.operationIdsKey.split('|').filter(Boolean)),
    [operationState.operationIdsKey],
  );

  // Single source of truth: derive the operation total from the same per-message
  // usage shown on each bubble, so the tray always equals their sum. (Updates as
  // messages refresh — no separate live accumulation that can drift.)
  const usageMetrics = useMemo(() => {
    return calculateOperationUsageMetrics(dbMessages, operationIds, operationsByMessage);
  }, [dbMessages, operationIds, operationsByMessage]);

  if (!operationState.startTime) return null;

  const { totalCost, totalTokens } = usageMetrics;
  const elapsed = now - operationState.startTime;
  const costLabel = t('chat:opStatusTray.cost');
  const stepLabel = t('chat:opStatusTray.steps');
  const tokenLabel = t('chat:opStatusTray.tokens', { defaultValue: 'tokens' });
  const generatingPhrases = parseStatusPhrases(
    t('opStatusTray:generatingPhrases', {
      defaultValue: [],
      returnObjects: true,
    }),
  );
  const rotationStep = phraseMotionEnabled ? Math.floor(elapsed / STATUS_PHRASE_ROTATION_MS) : 0;
  const randomGeneratingStatus =
    pickRotatingStatusPhrase(
      generatingPhrases,
      operationState.statusSeed ?? String(operationState.startTime),
      rotationStep,
    ) ?? t('chat:opStatusTray.status.generating');
  const statusText =
    operationState.activity === 'generating'
      ? randomGeneratingStatus
      : t(`chat:opStatusTray.status.${operationState.activity}`);

  // Zero-valued metrics render nothing; steps only matter for long-running
  // multi-step tasks, so a single step stays hidden too.
  const metrics = [
    operationState.steps > 1
      ? {
          icon: FootprintsIcon,
          key: 'steps',
          label: stepLabel,
          title: `${operationState.steps} ${stepLabel}`,
          value: String(operationState.steps),
        }
      : undefined,
    totalTokens > 0
      ? {
          icon: CoinsIcon,
          key: 'tokens',
          label: tokenLabel,
          title: `${formatTokens(totalTokens)} ${tokenLabel}`,
          value: formatTokens(totalTokens),
        }
      : undefined,
    totalCost > 0
      ? {
          icon: CircleDollarSignIcon,
          key: 'cost',
          label: costLabel,
          title: `${costLabel}: ${formatCost(totalCost)}`,
          value: formatCost(totalCost),
        }
      : undefined,
  ].filter((item): item is MetricItem => !!item);
  const tokenMetric = metrics.find((metric) => metric.key === 'tokens');

  const renderMetric = ({ icon, title, value }: MetricItem) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex">
              <span className={styles.metric}>
                {createElement(icon, { className: styles.metricIcon, size: 16 })}
                <span className={styles.metricValue}>{value}</span>
              </span>
            </span>
          }
        />
        <TooltipContent>{title}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const metricPopoverContent = (
    <div className={cn('flex flex-col gap-2', styles.metricPopover)}>
      {metrics.map(({ icon, key, label, value }) => (
        <div
          className={cn('flex items-center gap-5 justify-between', styles.metricPopoverRow)}
          key={key}
        >
          <span className={cn(styles.metric, styles.metricPopoverLabel)}>
            {createElement(icon, { className: styles.metricIcon, size: 16 })}
            <span>{label}</span>
          </span>
          <span className={styles.metricPopoverValue}>{value}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div
      className={cn(
        'flex items-center justify-between',
        styles.container,
        seamless ? styles.containerSeamless : styles.containerChrome,
        !seamless && topAttached && styles.containerTopAttached,
      )}
    >
      <span className={cn(styles.metric, styles.statusMetric)}>
        <ActivityGlyph motionEnabled={phraseMotionEnabled} />
        <span className={styles.statusText}>
          <span
            className={cn(styles.statusPhrase, phraseMotionEnabled && styles.statusPhraseMotion)}
            key={statusText}
          >
            <span
              className={
                phraseMotionEnabled
                  ? 'text-shiny [--shiny-rest-color:var(--muted-foreground)]'
                  : 'text-muted-foreground'
              }
            >
              {statusText}...
            </span>
          </span>
        </span>
        <span className={styles.timerValue}>{formatElapsedClockTime(elapsed)}</span>
      </span>

      {metrics.length > 0 && (
        <>
          <span className={cn(styles.metricGroup, styles.metricGroupFull)}>
            {metrics.map((metric, i) => (
              <Fragment key={metric.key}>
                {i > 0 && <span className={styles.divider} />}
                {renderMetric(metric)}
              </Fragment>
            ))}
          </span>
          {tokenMetric && (
            <Popover>
              <PopoverTrigger
                openOnHover
                render={
                  <span className={cn(styles.metric, styles.compactMetric)}>
                    <tokenMetric.icon className={styles.metricIcon} size={16} />
                    <span className={styles.metricValue}>{tokenMetric.value}</span>
                  </span>
                }
              />
              <PopoverContent align="end" side="top">
                {metricPopoverContent}
              </PopoverContent>
            </Popover>
          )}
        </>
      )}
    </div>
  );
});

OpStatusTray.displayName = 'OpStatusTray';

export default OpStatusTray;
