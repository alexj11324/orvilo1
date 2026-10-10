'use client';

import type { VerifyInteractionCost } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  formatSeconds,
  OPERATOR_KEYS,
  operatorValue,
  phaseOperatorSegments,
  phaseSeconds,
} from './interactionCostModel';

export { formatSeconds, readInteractionCost } from './interactionCostModel';

/**
 * The round's user-equivalent interaction cost, and the reader that lifts it off
 * a run's metadata bag.
 *
 * Extracted from ReportViewer so the acceptance aggregate can render it too:
 * the report only opens from owner-scoped round history, so a panel living
 * solely there is invisible to exactly the audience the number is for — the
 * reviewer deciding whether a flow is worth accepting.
 */

const operatorColors = String.raw`[--operator-color:var(--muted-foreground)] data-[operator=K]:[--operator-color:var(--klm-blue-1)] data-[operator=P]:[--operator-color:var(--klm-blue-2)] data-[operator=M]:[--operator-color:var(--klm-blue-3)] data-[operator=H]:[--operator-color:var(--klm-blue-4)] data-[operator=T\_chars]:[--operator-color:var(--klm-blue-5)] data-[operator=R\_ms]:[--operator-color:var(--klm-blue-6)]`;

const styles = {
  interactionCost: [
    'flex w-full flex-col gap-3',
    '[--klm-blue-1:color-mix(in_srgb,var(--info)_70%,var(--card))]',
    '[--klm-blue-2:var(--info)]',
    '[--klm-blue-3:color-mix(in_srgb,var(--info)_84%,var(--foreground))]',
    '[--klm-blue-4:color-mix(in_srgb,var(--info)_68%,var(--foreground))]',
    '[--klm-blue-5:color-mix(in_srgb,var(--info)_54%,var(--foreground))]',
    '[--klm-blue-6:color-mix(in_srgb,var(--info)_42%,var(--foreground))]',
  ].join(' '),
  interactionCostHeader: 'flex flex-wrap items-center justify-end gap-x-3 gap-y-2',
  interactionCostModel: 'font-mono text-[12px] text-(--ant-color-text-tertiary)',
  interactionMetric:
    'min-w-0 rounded-(--ant-border-radius-sm) border border-sidebar-border px-2.5 py-[9px]',
  interactionMetricLabel: 'mb-1 block text-[12px] text-(--ant-color-text-tertiary)',
  interactionMetricValue: 'text-[18px] leading-[1.2] font-[650] text-foreground tabular-nums',
  interactionMetrics: 'grid grid-cols-3 gap-2 [@media(width<=520px)]:grid-cols-[1fr]',
  operatorChip: [
    operatorColors,
    'inline-flex items-baseline gap-[5px] font-mono text-[12px] text-[color:color-mix(in_srgb,var(--operator-color)_72%,var(--muted-foreground))]',
    "before:mt-[0.5em] before:size-1.5 before:flex-none before:rounded-full before:bg-(--operator-color) before:content-['']",
    '[&_b]:font-[650] [&_b]:text-(--operator-color)',
  ].join(' '),
  operatorList: 'flex flex-wrap gap-x-3.5 gap-y-2',
  // The check title gives way before the phase name in a crowded row.
  phaseCheck: 'min-w-0 flex-auto truncate text-[11px] text-(--ant-color-text-quaternary)',
  phaseList: 'flex flex-col gap-2',
  phaseName:
    'flex min-w-0 items-baseline gap-1.5 overflow-hidden text-[12px] whitespace-nowrap text-muted-foreground',
  // Keep the phase visible even when its check title is long.
  phaseSlug: 'max-w-[60%] flex-none overflow-hidden text-ellipsis',
  phaseRow:
    'grid grid-cols-[minmax(120px,1fr)_minmax(140px,1.6fr)_auto] items-center gap-2.5 [@media(width<=640px)]:grid-cols-[1fr] [@media(width<=640px)]:gap-[5px]',
  phaseSegment: `${operatorColors} h-full min-w-[2px] flex-none bg-(--operator-color)`,
  phaseTrack:
    'flex h-2 overflow-hidden rounded-[999px] bg-transparent shadow-[inset_0_0_0_1px_var(--sidebar-border)]',
  phaseValue: 'text-[12px] text-(--ant-color-text-tertiary) tabular-nums',
};

export interface InteractionCostPanelProps {
  /**
   * `checkItemId` → the check's display label. A phase the driver attributed to
   * a check then names it, so a reviewer reads the cost against the thing being
   * judged rather than against an internal phase slug.
   */
  checkLabels?: Record<string, string>;
  cost: VerifyInteractionCost;
  /** Which round this measurement came from, when the host shows several. */
  roundLabel?: string;
}

const InteractionCostPanel = memo<InteractionCostPanelProps>(
  ({ checkLabels, cost, roundLabel }) => {
    const { t } = useTranslation('verify');
    const phases = cost.phases ?? [];
    const maxPhaseSeconds = Math.max(...phases.map(phaseSeconds), 0);
    const metrics = [
      {
        label: t('report.interaction.total'),
        value: formatSeconds(cost.totalSeconds),
      },
      {
        label: t('report.interaction.active'),
        value: formatSeconds(cost.activeSeconds),
      },
      {
        label: t('report.interaction.wait'),
        value: formatSeconds(cost.waitSeconds),
      },
    ];

    return (
      <section className={styles.interactionCost}>
        <div className={styles.interactionCostHeader}>
          {roundLabel && <span className={styles.interactionCostModel}>{roundLabel}</span>}
          <span className={styles.interactionCostModel}>{cost.model}</span>
        </div>

        <div className={styles.interactionMetrics}>
          {metrics.map((metric) => (
            <div className={styles.interactionMetric} key={metric.label}>
              <span className={styles.interactionMetricLabel}>{metric.label}</span>
              <span className={styles.interactionMetricValue}>{metric.value}</span>
            </div>
          ))}
        </div>

        <div className={styles.operatorList}>
          {OPERATOR_KEYS.map((key) => {
            const value = cost.operators[key];
            if (value === undefined) return null;

            return (
              <span className={styles.operatorChip} data-operator={key} key={key}>
                <span>{t(`report.interaction.operator.${key}`)}</span>
                <b>{operatorValue(key, value)}</b>
              </span>
            );
          })}
        </div>

        {phases.length > 0 && (
          <div className={styles.phaseList}>
            {phases.map((phase) => {
              const seconds = phaseSeconds(phase);
              const activeSeconds = phase.activeSeconds ?? 0;
              const waitSeconds = phase.waitSeconds ?? 0;
              const activeWidth = maxPhaseSeconds > 0 ? (activeSeconds / maxPhaseSeconds) * 100 : 0;
              const waitWidth = maxPhaseSeconds > 0 ? (waitSeconds / maxPhaseSeconds) * 100 : 0;
              const segments = phaseOperatorSegments(phase, cost.timingSeconds);
              const name = phase.label ?? phase.id;
              const checkLabel = phase.checkItemId
                ? (checkLabels?.[phase.checkItemId] ?? phase.checkItemId)
                : undefined;

              return (
                <div className={styles.phaseRow} key={phase.id}>
                  <span
                    className={styles.phaseName}
                    title={checkLabel ? `${name} · ${checkLabel}` : name}
                  >
                    <span className={styles.phaseSlug}>{name}</span>
                    {checkLabel && <span className={styles.phaseCheck}>{checkLabel}</span>}
                  </span>
                  <span className={styles.phaseTrack}>
                    {segments.length > 0 ? (
                      segments.map((segment) => (
                        <span
                          className={styles.phaseSegment}
                          data-operator={segment.key}
                          key={segment.key}
                          style={{
                            width: `${
                              maxPhaseSeconds > 0 ? (segment.seconds / maxPhaseSeconds) * 100 : 0
                            }%`,
                          }}
                          title={`${t(`report.interaction.operator.${segment.key}`)} ${formatSeconds(
                            segment.seconds,
                          )}`}
                        />
                      ))
                    ) : (
                      <>
                        <span
                          className={styles.phaseSegment}
                          style={{ width: `${activeWidth}%` }}
                        />
                        <span
                          className={styles.phaseSegment}
                          data-operator={'R_ms'}
                          style={{ width: `${waitWidth}%` }}
                        />
                      </>
                    )}
                  </span>
                  <span className={styles.phaseValue}>{formatSeconds(seconds)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  },
);

InteractionCostPanel.displayName = 'InteractionCostPanel';

export default InteractionCostPanel;
