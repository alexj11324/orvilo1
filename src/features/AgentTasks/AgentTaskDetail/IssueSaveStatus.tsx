'use client';

import { CheckIcon, TriangleAlertIcon } from 'lucide-react';
import { memo, useEffect, useReducer, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import { initialSaveIndicator, reduceSaveIndicator, SAVED_VISIBLE_MS } from './saveIndicator';
import { hasTaskSaveRetry, retryFailedTaskSave, subscribeTaskSaveRetry } from './taskSaveRetry';

interface IssueSaveStatusProps {
  taskId: string;
}

/**
 * The issue's one save status for title and description: "Saving…", then
 * "Saved" for about two seconds, then nothing. A failed write stays with a
 * Retry when a failed title or description write can be re-sent. Mount it keyed by task so a stale status never
 * carries across issues.
 */
const IssueSaveStatus = memo<IssueSaveStatusProps>(({ taskId }) => {
  const { t } = useTranslation('editor');
  const status = useTaskStore((s) => taskDetailSelectors.taskSaveStatusFor(s, taskId));
  const updateTask = useTaskStore((s) => s.updateTask);
  const [indicator, dispatch] = useReducer(reduceSaveIndicator, status, initialSaveIndicator);
  const previousStatus = useRef(status);
  const canRetry = useSyncExternalStore(
    subscribeTaskSaveRetry,
    () => hasTaskSaveRetry(taskId),
    () => false,
  );

  useEffect(() => {
    if (previousStatus.current === status) return;
    previousStatus.current = status;
    dispatch({ status, type: 'status' });
  }, [status]);

  useEffect(() => {
    if (indicator !== 'saved') return;
    const timer = setTimeout(() => dispatch({ type: 'expire' }), SAVED_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [indicator]);

  if (indicator === 'idle') return null;

  if (indicator === 'failed') {
    return (
      <span className="flex min-w-0 shrink-0 items-center gap-1 text-xs text-destructive-text">
        <TriangleAlertIcon aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">{t('autoSave.failed')}</span>
        {canRetry && (
          <Button
            className="h-5 px-1 text-xs"
            size="sm"
            variant="ghost"
            onClick={() => retryFailedTaskSave(taskId, updateTask)}
          >
            {t('autoSave.retry')}
          </Button>
        )}
      </span>
    );
  }

  return (
    <span
      aria-live="polite"
      className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
      role="status"
    >
      {indicator === 'saving' ? (
        <Spinner aria-hidden className="size-3.5" />
      ) : (
        <CheckIcon aria-hidden className="size-3.5" />
      )}
      {indicator === 'saving' ? t('autoSave.savingShort') : t('autoSave.saved')}
    </span>
  );
});

IssueSaveStatus.displayName = 'IssueSaveStatus';

export default IssueSaveStatus;
