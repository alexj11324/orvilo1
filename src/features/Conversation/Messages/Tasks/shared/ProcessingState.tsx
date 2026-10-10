'use client';


import { type TaskDetail } from '@orvilo/types';
import { cn } from 'cn';
import { Footprints, Timer, Wrench } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { useChatStore } from '@/store/chat';

import { MAX_PROGRESS, PROGRESS_INCREMENT, PROGRESS_INTERVAL } from './constants';
import { formatElapsedTime, formatToolName } from './utils';

const styles = {
  activityRow: 'flex items-center gap-2 py-2',
  footer: '[padding-block-start:8px] [border-block-start:1px_solid_var(--sidebar-border)]',
  progress: 'relative mx-2 my-3 h-[3px] overflow-hidden rounded-[2px] bg-selected',
  progressBar: 'absolute h-full rounded-[2px] [inset-block-start:0] [inset-inline-start:0] [background:linear-gradient(90deg,var(--primary),var(--primary-hover))] transition-[width] duration-500 ease-out',
  progressCompact: 'relative h-[3px] overflow-hidden rounded-[2px] bg-selected',
  progressShimmer: 'absolute size-full [inset-block-start:0] [inset-inline-start:0] [background:linear-gradient(90deg,transparent,var(--ant-color-primary-bg-hover),transparent)] animate-[text-shiny-sweep-transform_2s_ease_infinite] motion-reduce:hidden',
  separator: 'size-[3px] rounded-[50%] bg-[var(--ant-color-text-quaternary)]',
};

export type ProcessingStateVariant = 'detail' | 'compact';

interface ProcessingStateProps {
  /**
   * Message ID for updating task status in store
   */
  messageId: string;
  taskDetail: TaskDetail;
  variant?: ProcessingStateVariant;
}

const ProcessingState = memo<ProcessingStateProps>(
  ({ taskDetail, messageId, variant = 'detail' }) => {
    const { t } = useTranslation('chat');
    const [progress, setProgress] = useState(5);
    const [elapsedTime, setElapsedTime] = useState(0);

    // Get polling hook and check if there's an active operation polling
    const [useEnablePollingTaskStatus, operations] = useChatStore((s) => [
      s.useEnablePollingTaskStatus,
      s.operations,
    ]);

    // Check if exec_async_task is already polling for this message
    const hasActiveOperationPolling = Object.values(operations).some(
      (op) =>
        op.status === 'running' &&
        op.type === 'execAgentRuntime' &&
        op.context?.messageId === messageId,
    );

    // Enable polling only when no active operation is already polling
    // This handles the case when user refreshes page and exec_async_task is no longer running
    const { data } = useEnablePollingTaskStatus(
      taskDetail.threadId,
      messageId,
      !hasActiveOperationPolling,
    );

    const currentActivity = data?.currentActivity;
    const { totalToolCalls, totalSteps, startedAt } = taskDetail;

    // Calculate initial progress and elapsed time based on startedAt
    useEffect(() => {
      if (startedAt) {
        const startTime = new Date(startedAt).getTime();
        const elapsed = Math.max(0, Date.now() - startTime);
        const intervals = Math.floor(elapsed / PROGRESS_INTERVAL);
        const initialProgress = Math.min(5 + intervals * PROGRESS_INCREMENT, MAX_PROGRESS);
        setProgress(initialProgress);
        setElapsedTime(elapsed);
      }
    }, [startedAt]);

    // Timer for updating elapsed time every second
    useEffect(() => {
      if (!startedAt) return;

      const timer = setInterval(() => {
        const startTime = new Date(startedAt).getTime();
        setElapsedTime(Math.max(0, Date.now() - startTime));
      }, 1000);

      return () => clearInterval(timer);
    }, [startedAt]);

    // Progress timer - increment every 30 seconds
    useEffect(() => {
      const timer = setInterval(() => {
        setProgress((prev) => Math.min(prev + PROGRESS_INCREMENT, MAX_PROGRESS));
      }, PROGRESS_INTERVAL);

      return () => clearInterval(timer);
    }, []);

    // Render current activity text
    const renderActivityText = () => {
      if (!currentActivity) return null;

      switch (currentActivity.type) {
        case 'tool_calling': {
          const toolName = formatToolName(currentActivity);
          return toolName
            ? t('task.activity.toolCalling', { toolName })
            : t('task.activity.calling');
        }
        case 'tool_result': {
          const toolName = formatToolName(currentActivity);
          return toolName
            ? t('task.activity.toolResult', { toolName })
            : t('task.activity.gotResult');
        }
        case 'generating': {
          return t('task.activity.generating');
        }
        default: {
          return null;
        }
      }
    };

    const hasMetrics =
      startedAt ||
      (totalSteps !== undefined && totalSteps > 0) ||
      (totalToolCalls !== undefined && totalToolCalls > 0);

    // Detail variant: Task version layout (activity row with content preview)
    if (variant === 'detail') {
      return (
        <div className="flex flex-col">
          {/* Current Activity */}
          {currentActivity && (
            <div className={styles.activityRow}>
              <div className="flex items-center gap-1">
                <NeuralNetworkLoading size={14} />
                <span className='text-[12px] text-muted-foreground'>
                  {renderActivityText()}
                </span>
              </div>
              {currentActivity.contentPreview && (
                <span className='truncate text-[12px] text-muted-foreground' style={{  whiteSpace: 'nowrap'  }}>
                  {currentActivity.contentPreview}
                </span>
              )}
            </div>
          )}

          {/* Progress Bar */}
          <div className={styles.progress}>
            <div className={styles.progressBar} style={{ width: `${progress}%` }} />
            <div className={styles.progressShimmer} />
          </div>

          {/* Footer with metrics */}
          <div className={cn('flex items-center gap-3 justify-between flex-wrap', styles.footer)}
          >
            <div className="flex items-center gap-3">
              {/* Elapsed Time */}
              {startedAt && (
                <span className='text-[12px] text-muted-foreground'>
                  <Timer size={12} />
                  <span className="text-[12px] text-muted-foreground font-medium">
                    {formatElapsedTime(elapsedTime)}
                  </span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Steps */}
              {totalSteps !== undefined && totalSteps > 0 && (
                <span className='text-[12px] text-muted-foreground'>
                  <Footprints size={12} />
                  <span className="text-[12px] text-muted-foreground font-medium">
                    {totalSteps}
                  </span>
                  <span>{t('task.metrics.stepsShort')}</span>
                </span>
              )}
              {/* Tool Calls */}
              {totalToolCalls !== undefined && totalToolCalls > 0 && (
                <>
                  {hasMetrics && totalSteps !== undefined && totalSteps > 0 && (
                    <div className={styles.separator} />
                  )}
                  <span className='text-[12px] text-muted-foreground'>
                    <Wrench size={12} />
                    <span className="text-[12px] text-muted-foreground font-medium">
                      {totalToolCalls}
                    </span>
                    <span>{t('task.metrics.toolCallsShort')}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Compact variant: Tasks version layout (simplified activity, no content preview)
    return (
      <div className="flex flex-col gap-2">
        {/* Current Activity */}
        {currentActivity && (
          <div className="flex items-center gap-2">
            <NeuralNetworkLoading size={14} />
            <span className='truncate text-[12px] text-muted-foreground' style={{  whiteSpace: 'nowrap'  }}>
              {renderActivityText()}
            </span>
          </div>
        )}

        {/* Progress Bar */}
        <div className={styles.progressCompact}>
          <div className={styles.progressBar} style={{ width: `${progress}%` }} />
          <div className={styles.progressShimmer} />
        </div>

        {/* Footer with metrics */}
        {hasMetrics && (
          <div className={cn('flex items-center gap-3 justify-between flex-wrap', styles.footer)}
          >
            {/* Left side: Elapsed Time */}
            <div className="flex items-center gap-2">
              {startedAt && (
                <span className='text-[12px] text-muted-foreground'>
                  <Timer size={12} />
                  <span className="text-[12px] text-muted-foreground font-medium">
                    {formatElapsedTime(elapsedTime)}
                  </span>
                </span>
              )}
            </div>

            {/* Right side: Steps, Tool Calls */}
            <div className="flex items-center gap-3">
              {totalSteps !== undefined && totalSteps > 0 && (
                <span className='text-[12px] text-muted-foreground'>
                  <Footprints size={12} />
                  <span className="text-[12px] text-muted-foreground font-medium">
                    {totalSteps}
                  </span>
                  <span>{t('task.metrics.stepsShort')}</span>
                </span>
              )}
              {totalToolCalls !== undefined && totalToolCalls > 0 && (
                <>
                  {totalSteps !== undefined && totalSteps > 0 && (
                    <div className={styles.separator} />
                  )}
                  <span className='text-[12px] text-muted-foreground'>
                    <Wrench size={12} />
                    <span className="text-[12px] text-muted-foreground font-medium">
                      {totalToolCalls}
                    </span>
                    <span>{t('task.metrics.toolCallsShort')}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  },
);

ProcessingState.displayName = 'ProcessingState';

export default ProcessingState;
