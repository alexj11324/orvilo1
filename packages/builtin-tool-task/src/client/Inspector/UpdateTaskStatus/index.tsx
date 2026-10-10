'use client';

import type { BuiltinInspectorProps, TaskStatus } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { UpdateTaskStatusParams, UpdateTaskStatusState } from '../../../types';

const STATUS_TONE: Partial<Record<TaskStatus, { bg: string; fg: string }>> = {
  backlog: { bg: 'var(--accent)', fg: 'var(--muted-foreground)' },
  canceled: { bg: 'var(--accent)', fg: 'var(--muted-foreground)' },
  completed: { bg: 'var(--ant-color-success-bg)', fg: 'var(--success)' },
  failed: { bg: 'var(--ant-color-error-bg)', fg: 'var(--destructive)' },
  paused: { bg: 'var(--accent)', fg: 'var(--muted-foreground)' },
  running: { bg: 'var(--ant-color-warning-bg)', fg: 'var(--warning)' },
  scheduled: { bg: 'var(--ant-color-info-bg)', fg: 'var(--info)' },
};

const styles = {
  identifierChip:
    'shrink-0 rounded-[999px] bg-accent px-2 py-0.5 font-mono text-[12px] text-muted-foreground',
  separator: 'shrink-0 text-[var(--ant-color-text-quaternary)]',
  statusChip: 'shrink-0 rounded-[999px] px-2 py-0.5 text-[12px]',
};

export const UpdateTaskStatusInspector = memo<
  BuiltinInspectorProps<UpdateTaskStatusParams, UpdateTaskStatusState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading }) => {
  const { t } = useTranslation('plugin');

  const identifier = args?.identifier || partialArgs?.identifier;
  const status = (args?.status || partialArgs?.status) as TaskStatus | undefined;
  const tone = status ? STATUS_TONE[status] : undefined;

  return (
    <div className={inspectorTextStyles.root} style={{ flexWrap: 'wrap', gap: 4 }}>
      <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
        {t('builtins.orvilo-task.apiName.updateTaskStatus')}
      </span>
      {identifier && <span className={styles.identifierChip}>{identifier}</span>}
      {status && (
        <>
          <span className={styles.separator}>·</span>
          <span
            className={styles.statusChip}
            style={{
              background: tone?.bg ?? 'var(--accent)',
              color: tone?.fg ?? 'var(--muted-foreground)',
            }}
          >
            {status}
          </span>
        </>
      )}
    </div>
  );
});

UpdateTaskStatusInspector.displayName = 'UpdateTaskStatusInspector';

export default UpdateTaskStatusInspector;
