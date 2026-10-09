'use client';

import { Footprints, ListChecksIcon, Wrench, XIcon } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { ThreadStatus } from '@/types/index';

import { formatDuration, formatElapsedTime, isProcessingStatus } from '../shared';

export interface TaskMetrics {
  /** Task duration in milliseconds (for completed tasks) */
  duration?: number;
  /** Whether metrics are still loading */
  isLoading?: boolean;
  /** Start time timestamp for elapsed time calculation */
  startTime?: number;
  /** Number of execution steps/blocks */
  steps?: number;
  /** Total tool calls count */
  toolCalls?: number;
}

interface TaskTitleProps {
  /** Metrics to display (steps, tool calls, elapsed time) */
  metrics?: TaskMetrics;
  status?: ThreadStatus;
  title?: string;
}

const TaskStatusIndicator = memo<{ status?: ThreadStatus }>(({ status }) => {
  const isCompleted = status === ThreadStatus.Completed;
  const isError = status === ThreadStatus.Failed || status === ThreadStatus.Cancel;
  const isProcessing = status ? isProcessingStatus(status) : false;
  const isInitializing = !status;

  let icon;

  if (isCompleted) {
    icon = <ListChecksIcon className="size-4 text-success" />;
  } else if (isError) {
    icon = <XIcon className="size-4 text-destructive" />;
  } else if (isProcessing || isInitializing) {
    icon = <NeuralNetworkLoading size={16} />;
  } else {
    return null;
  }

  return <span className="inline-flex size-4 shrink-0 items-center justify-center">{icon}</span>;
});

TaskStatusIndicator.displayName = 'TaskStatusIndicator';

interface MetricsDisplayProps {
  metrics: TaskMetrics;
  status?: ThreadStatus;
}

const MetricsDisplay = memo<MetricsDisplayProps>(({ metrics, status }) => {
  const { t } = useTranslation('chat');
  const { steps, toolCalls, startTime, duration, isLoading } = metrics;
  const [elapsedTime, setElapsedTime] = useState(0);

  const isProcessing = status ? isProcessingStatus(status) : false;

  // Calculate initial elapsed time
  useEffect(() => {
    if (startTime && isProcessing) {
      setElapsedTime(Math.max(0, Date.now() - startTime));
    }
  }, [startTime, isProcessing]);

  // Timer for updating elapsed time every second (only when processing)
  useEffect(() => {
    if (!startTime || !isProcessing) return;

    const timer = setInterval(() => {
      setElapsedTime(Math.max(0, Date.now() - startTime));
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime, isProcessing]);

  // Don't show metrics if loading or no data
  if (isLoading) return null;

  const hasSteps = steps !== undefined && steps > 0;
  const hasToolCalls = toolCalls !== undefined && toolCalls > 0;
  const hasTime = isProcessing ? startTime !== undefined : duration !== undefined;

  // Don't render if no metrics to show
  if (!hasSteps && !hasToolCalls && !hasTime) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Steps */}
      {hasSteps && (
        <div className="flex items-center gap-0.5">
          <Footprints className="text-muted-foreground" size={12} />
          <div className="text-xs text-muted-foreground">{steps}</div>
        </div>
      )}
      {/* Tool calls */}
      {hasToolCalls && (
        <div className="flex items-center gap-0.5">
          <Wrench className="text-muted-foreground" size={12} />
          <div className="text-xs text-muted-foreground">{toolCalls}</div>
        </div>
      )}
      {/* Time */}
      {hasTime && (
        <div className="text-xs text-muted-foreground">
          {isProcessing
            ? formatElapsedTime(elapsedTime)
            : duration
              ? t('task.metrics.duration', { duration: formatDuration(duration) })
              : null}
        </div>
      )}
    </div>
  );
});

MetricsDisplay.displayName = 'MetricsDisplay';

const TaskTitle = memo<TaskTitleProps>(({ title, status, metrics }) => {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <TaskStatusIndicator status={status} />
      <div className="truncate text-sm">{title}</div>
      {metrics && <MetricsDisplay metrics={metrics} status={status} />}
    </div>
  );
});

TaskTitle.displayName = 'TaskTitle';

export default TaskTitle;
