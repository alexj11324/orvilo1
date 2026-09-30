import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

/** `3m` · `2.1h` · `1.4d` — the coarse grain a list row can carry. */
export const formatGoalDuration = (milliseconds: number) => {
  if (!milliseconds || milliseconds <= 0) return '—';
  const minutes = milliseconds / 60_000;
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
};

export const formatGoalCost = (cost: number) => (cost > 0 ? `$${cost.toFixed(2)}` : '—');

const styles = createStaticStyles(({ css }) => ({
  acceptance: css`
    min-width: 0;
  `,
  metric: css`
    justify-self: end;
    white-space: nowrap;
  `,
  metrics: css`
    display: grid;
    grid-template-columns: minmax(178px, 1fr) 72px 48px 64px;
    column-gap: 12px;
    align-items: center;

    width: min(100%, 390px);
    min-width: 390px;
  `,
  needsYou: css`
    justify-self: end;
    color: ${cssVar.colorWarning};
    white-space: nowrap;
  `,
  progress: css`
    overflow: hidden;

    width: 64px;
    height: 4px;
    border-radius: ${cssVar.borderRadiusXS};

    background: ${cssVar.colorFillSecondary};
  `,
  progressValue: css`
    height: 100%;
    border-radius: inherit;
    background: ${cssVar.colorSuccess};
    transition: width 0.2s ${cssVar.motionEaseOut};
  `,
}));

export interface GoalProgressProps {
  findingCount: number;
  pendingDecisions: number;
  taskDone: number;
  taskTotal: number;
  totalRunCost: number;
  totalRunDuration: number;
}

/**
 * The list row's roll-up: how far the graph got, what it produced, what it
 * cost — and, taking priority over the findings count, whether anything is
 * blocked on the user right now.
 */
export const GoalProgress = memo<GoalProgressProps>(
  ({ findingCount, pendingDecisions, totalRunCost, totalRunDuration, taskDone, taskTotal }) => {
    const { t } = useTranslation('chat');
    const progress = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0;

    return (
      <div className={styles.metrics}>
        {taskTotal > 0 ? (
          <div className={`flex items-center gap-1.5 ${styles.acceptance}`}>
            <div aria-hidden className={styles.progress}>
              <div className={styles.progressValue} style={{ width: `${progress}%` }} />
            </div>
            <div
              className="truncate min-w-0 text-[12px]"
              style={{ color: cssVar.colorTextTertiary }}
            >
              {t('goalList.taskProgress', { done: taskDone, total: taskTotal })}
            </div>
          </div>
        ) : (
          <div className="truncate min-w-0 text-[12px]" style={{ color: cssVar.colorTextTertiary }}>
            {t('goalList.noTasks')}
          </div>
        )}
        {pendingDecisions > 0 ? (
          <div className={cn('text-[12px]', styles.needsYou)}>
            {t('goalList.needsYou', { count: pendingDecisions })}
          </div>
        ) : (
          <div
            className={cn('text-[12px]', styles.metric)}
            style={{ color: cssVar.colorTextTertiary }}
          >
            {t('goalList.findings', { count: findingCount })}
          </div>
        )}
        <div
          className={cn('text-[12px]', styles.metric)}
          style={{ color: cssVar.colorTextTertiary }}
        >
          {formatGoalDuration(totalRunDuration)}
        </div>
        <div
          className={cn('text-[12px]', styles.metric)}
          style={{ color: cssVar.colorTextTertiary }}
        >
          {formatGoalCost(totalRunCost)}
        </div>
      </div>
    );
  },
);

GoalProgress.displayName = 'GoalProgress';
