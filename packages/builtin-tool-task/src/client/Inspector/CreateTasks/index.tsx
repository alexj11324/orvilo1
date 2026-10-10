'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { CreateTasksParams, CreateTasksState } from '../../../types';

const styles = {
  countBadge:
    'shrink-0 rounded-[999px] bg-[var(--ant-color-success-bg)] px-2 py-px text-[12px] font-medium text-success',
  moreBadge: 'shrink-0 text-[12px] text-[var(--ant-color-text-tertiary)]',
  previewChip:
    'inline-flex min-w-0 max-w-[280px] shrink items-center truncate rounded-[999px] bg-accent px-2 py-px text-[12px] text-foreground',
  separator: 'shrink-0 text-[var(--ant-color-text-quaternary)]',
};

export const CreateTasksInspector = memo<
  BuiltinInspectorProps<CreateTasksParams, CreateTasksState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');

  const tasks = args?.tasks || partialArgs?.tasks || [];
  const results = pluginState?.results || [];
  const count = results.length || tasks.length;
  const previewName = tasks[0]?.name || results[0]?.name;
  const remaining = count - 1;

  if (isArgumentsStreaming && count === 0) {
    return (
      <div className={inspectorTextStyles.root}>
        <span className={shinyTextStyles.shinyText}>
          {t('builtins.orvilo-task.apiName.createTasks')}
        </span>
      </div>
    );
  }

  return (
    <div className={inspectorTextStyles.root} style={{ flexWrap: 'wrap', gap: 6 }}>
      <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
        {t('builtins.orvilo-task.apiName.createTasks')}
      </span>
      {count > 0 && (
        <span className={styles.countBadge}>
          {t('builtins.orvilo-task.createTasks.count', { count })}
        </span>
      )}
      {previewName && (
        <>
          <span className={styles.separator}>·</span>
          <span className={styles.previewChip}>{previewName}</span>
          {remaining > 0 && (
            <span className={styles.moreBadge}>
              {t('builtins.orvilo-task.createTasks.more', { count: remaining })}
            </span>
          )}
        </>
      )}
    </div>
  );
});

CreateTasksInspector.displayName = 'CreateTasksInspector';

export default CreateTasksInspector;
