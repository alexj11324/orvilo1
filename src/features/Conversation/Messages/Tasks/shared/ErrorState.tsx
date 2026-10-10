'use client';

import { Info,MessageSquare, Timer, Wrench } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CodeBlock } from '@/components/ui/code-block';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { type TaskDetail } from '@/types/index';
import { ThreadStatus } from '@/types/index';

import { MetricItem } from './CompletedState';
import { formatCost, formatDuration } from './utils';

const styles = {
  separator: 'size-[3px] rounded-[50%] bg-[var(--ant-color-text-quaternary)]',
};

interface ErrorStateProps {
  taskDetail: TaskDetail;
}

/**
 * Extract displayable error content from various error structures
 */
const getErrorContent = (error: Record<string, any> | undefined): string | null => {
  if (!error) return null;

  // Try common error structures
  // 1. error.error.body (TRPC style)
  if (error.error?.body) {
    return JSON.stringify(error.error.body, null, 2);
  }

  // 2. error.body (direct body)
  if (error.body && typeof error.body === 'object') {
    return JSON.stringify(error.body, null, 2);
  }

  // 3. error.message (if it's not "[object Object]")
  if (error.message && typeof error.message === 'string' && error.message !== '[object Object]') {
    return error.message;
  }

  // 4. If error itself is an object with meaningful content, stringify it
  // Skip if it only has a useless message field
  const keys = Object.keys(error);
  if (keys.length > 0) {
    // Filter out useless "[object Object]" values
    const meaningfulEntries = Object.entries(error).filter(([, value]) => {
      if (typeof value === 'string' && value === '[object Object]') return false;
      return true;
    });

    if (meaningfulEntries.length > 0) {
      return JSON.stringify(Object.fromEntries(meaningfulEntries), null, 2);
    }
  }

  return null;
};

const ErrorState = memo<ErrorStateProps>(({ taskDetail }) => {
  const { t } = useTranslation('chat');

  const { status, duration, totalToolCalls, totalMessages, totalCost, error } = taskDetail;

  const isCancelled = status === ThreadStatus.Cancel;

  // Format duration and cost using shared utilities
  const formattedDuration = useMemo(() => formatDuration(duration), [duration]);
  const formattedCost = useMemo(() => formatCost(totalCost), [totalCost]);

  // Extract error content
  const errorContent = useMemo(() => getErrorContent(error), [error]);

  const hasMetrics = !!(formattedDuration || totalToolCalls || totalMessages || formattedCost);

  return (
    <div className="flex flex-col gap-3">
      {/* Error Content */}
      <Alert variant="default">
        <Info />
        <AlertTitle>
          {isCancelled ? t('task.status.cancelled') : t('task.status.failed')}
        </AlertTitle>
        {errorContent && (
          <Collapsible className="col-start-2">
            <CollapsibleTrigger className="text-xs text-muted-foreground">
              Show Details
            </CollapsibleTrigger>
            <CollapsibleContent>
              <AlertDescription>
                <CodeBlock
                  code={errorContent}
                  language="json"
                  style={{ padding: 8 }}
                  variant="ghost"
                />
              </AlertDescription>
            </CollapsibleContent>
          </Collapsible>
        )}
      </Alert>
      {hasMetrics ? (
        <div className="flex items-center gap-3 flex-wrap">
          {/* Duration */}
          {formattedDuration && <MetricItem icon={Timer} value={formattedDuration} />}

          {/* Tool Calls */}
          {totalToolCalls !== undefined && totalToolCalls > 0 && (
            <>
              <div className={styles.separator} />
              <MetricItem
                icon={Wrench}
                label={t('task.metrics.toolCallsShort', { defaultValue: 'tools' })}
                value={totalToolCalls}
              />
            </>
          )}

          {/* Messages */}
          {totalMessages !== undefined && totalMessages > 0 && (
            <>
              <div className={styles.separator} />
              <MetricItem
                icon={MessageSquare}
                label={t('task.metrics.messagesShort', { defaultValue: 'messages' })}
                value={totalMessages}
              />
            </>
          )}

          {/* Cost */}
          {formattedCost && (
            <>
              <div className={styles.separator} />
              <MetricItem value={formattedCost} />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
});

ErrorState.displayName = 'ErrorState';

export default ErrorState;
