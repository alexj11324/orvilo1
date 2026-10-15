'use client';

import type { BuiltinInspectorProps, TaskStatus } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { UpdateTaskStatusParams, UpdateTaskStatusState } from '../../../types';

const STATUS_TONE: Partial<Record<TaskStatus, string>> = {
  backlog: 'bg-accent text-muted-foreground',
  canceled: 'bg-accent text-muted-foreground',
  completed: 'bg-success-wash text-success-text',
  failed: 'bg-destructive-wash text-destructive-text',
  paused: 'bg-accent text-muted-foreground',
  running: 'bg-warning-wash text-warning-text',
  scheduled: 'bg-info-wash text-info-text',
};

const styles = {
  identifierChip:
    'shrink-0 rounded-(--radius-chip) bg-accent px-2 py-0.5 font-mono text-xs text-muted-foreground',
  separator: 'shrink-0 text-foreground-quaternary',
  statusChip: 'shrink-0 rounded-(--radius-chip) px-2 py-0.5 text-xs',
};

export const UpdateTaskStatusInspector = memo<
  BuiltinInspectorProps<UpdateTaskStatusParams, UpdateTaskStatusState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading }) => {
  const { t } = useTranslation('plugin');

  const identifier = args?.identifier || partialArgs?.identifier;
  const status = (args?.status || partialArgs?.status) as TaskStatus | undefined;
  const tone = status ? STATUS_TONE[status] : undefined;

  return (
    <div className={cn(inspectorTextStyles.root, 'flex-wrap gap-1')}>
      <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
        {t('builtins.orvilo-task.apiName.updateTaskStatus')}
      </span>
      {identifier && <span className={styles.identifierChip}>{identifier}</span>}
      {status && (
        <>
          <span className={styles.separator}>·</span>
          <span className={cn(styles.statusChip, tone ?? 'bg-accent text-muted-foreground')}>
            {status}
          </span>
        </>
      )}
    </div>
  );
});

UpdateTaskStatusInspector.displayName = 'UpdateTaskStatusInspector';

export default UpdateTaskStatusInspector;
