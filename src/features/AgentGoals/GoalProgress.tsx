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

const styles = {
  acceptance: 'min-w-0',
  metric: 'justify-self-end whitespace-nowrap',
  metrics:
    'grid grid-cols-[minmax(178px,1fr)_72px_48px_64px] gap-x-3 items-center w-[min(100%,390px)] min-w-[390px]',
  needsYou: 'justify-self-end text-warning whitespace-nowrap',
  progress: 'overflow-hidden w-16 h-1 rounded-(--ant-border-radius-xs) bg-selected',
  progressValue:
    'h-full rounded-[inherit] bg-success [transition:width_0.2s_var(--ant-motion-ease-out)]',
};

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
              style={{ color: 'var(--ant-color-text-tertiary)' }}
            >
              {t('goalList.taskProgress', { done: taskDone, total: taskTotal })}
            </div>
          </div>
        ) : (
          <div
            className="truncate min-w-0 text-[12px]"
            style={{ color: 'var(--ant-color-text-tertiary)' }}
          >
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
            style={{ color: 'var(--ant-color-text-tertiary)' }}
          >
            {t('goalList.findings', { count: findingCount })}
          </div>
        )}
        <div
          className={cn('text-[12px]', styles.metric)}
          style={{ color: 'var(--ant-color-text-tertiary)' }}
        >
          {formatGoalDuration(totalRunDuration)}
        </div>
        <div
          className={cn('text-[12px]', styles.metric)}
          style={{ color: 'var(--ant-color-text-tertiary)' }}
        >
          {formatGoalCost(totalRunCost)}
        </div>
      </div>
    );
  },
);

GoalProgress.displayName = 'GoalProgress';
