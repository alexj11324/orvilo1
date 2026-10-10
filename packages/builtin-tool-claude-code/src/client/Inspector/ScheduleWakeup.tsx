'use client';

import { inspectorTextStyles, shinyTextStyles } from '@orvilo/shared-tool-ui/styles';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ClaudeCodeApiName, type ScheduleWakeupArgs } from '../../types';

const styles = {
  chip: 'overflow-hidden inline-flex shrink items-center min-w-0 ms-1.5 py-px px-2 rounded-[999px] text-[12px] text-foreground text-ellipsis whitespace-nowrap bg-accent',
  delay: 'shrink-0 ms-2 text-[var(--ant-color-text-description)]',
};

const formatDelay = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return `${seconds}s`;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  if (minutes < 60) {
    return remSeconds > 0 ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
};

/**
 * CC's self-paced wakeup scheduler. `reason` (the model's one-sentence
 * justification) goes in the chip as the primary signal; `delaySeconds`
 * trails at the end as secondary context.
 */
export const ScheduleWakeupInspector = memo<BuiltinInspectorProps<ScheduleWakeupArgs>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading }) => {
    const { t } = useTranslation('plugin');
    const label = t(ClaudeCodeApiName.ScheduleWakeup as any);

    const source = args ?? partialArgs;
    const delay = source?.delaySeconds;
    const reason = source?.reason?.trim();

    const isShiny = isArgumentsStreaming || isLoading;

    if (isArgumentsStreaming && delay === undefined && !reason) {
      return <div className={cn(inspectorTextStyles.root, shinyTextStyles.shinyText)}>{label}</div>;
    }

    return (
      <div className={inspectorTextStyles.root}>
        <span className={cn(isShiny && shinyTextStyles.shinyText)}>
          {reason || typeof delay === 'number' ? `${label}:` : label}
        </span>
        {reason && <span className={styles.chip}>{reason}</span>}
        {typeof delay === 'number' && <span className={styles.delay}>· {formatDelay(delay)}</span>}
      </div>
    );
  },
);

ScheduleWakeupInspector.displayName = 'ClaudeCodeScheduleWakeupInspector';
