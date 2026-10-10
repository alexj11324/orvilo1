'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { Play } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { RunTasksParams, RunTasksState } from '../../../types';

const styles = {
  countBadge:
    'shrink-0 rounded-[999px] bg-[var(--ant-color-warning-bg)] px-2 py-px text-[12px] font-medium text-warning',
  failedBadge:
    'shrink-0 rounded-[999px] bg-[var(--ant-color-error-bg)] px-2 py-px text-[12px] text-destructive',
  identifierChip:
    'shrink-0 rounded-[999px] bg-accent px-2 py-px font-mono text-[12px] text-muted-foreground',
  moreBadge: 'shrink-0 text-[12px] text-[var(--ant-color-text-tertiary)]',
  separator: 'shrink-0 text-[var(--ant-color-text-quaternary)]',
};

export const RunTasksInspector = memo<BuiltinInspectorProps<RunTasksParams, RunTasksState>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
    const { t } = useTranslation('plugin');

    const identifiers = args?.identifiers || partialArgs?.identifiers || [];
    const results = pluginState?.results || [];
    const count = results.length || identifiers.length;
    const previewId = identifiers[0] || results[0]?.identifier;
    const remaining = count - 1;
    const failed = pluginState?.failed ?? 0;

    if (isArgumentsStreaming && count === 0) {
      return (
        <div className={inspectorTextStyles.root}>
          <Play size={12} style={{ color: 'var(--warning)' }} />
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-task.apiName.runTasks')}
          </span>
        </div>
      );
    }

    return (
      <div className={inspectorTextStyles.root} style={{ flexWrap: 'wrap', gap: 6 }}>
        <Play size={12} style={{ color: 'var(--warning)' }} />
        <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
          {t('builtins.orvilo-task.apiName.runTasks')}
        </span>
        {count > 0 && (
          <span className={styles.countBadge}>
            {t('builtins.orvilo-task.runTasks.count', { count })}
          </span>
        )}
        {previewId && (
          <>
            <span className={styles.separator}>·</span>
            <span className={styles.identifierChip}>{previewId}</span>
            {remaining > 0 && (
              <span className={styles.moreBadge}>
                {t('builtins.orvilo-task.runTasks.more', { count: remaining })}
              </span>
            )}
          </>
        )}
        {failed > 0 && (
          <span className={styles.failedBadge}>
            {t('builtins.orvilo-task.runTasks.failedCount', { count: failed })}
          </span>
        )}
      </div>
    );
  },
);

RunTasksInspector.displayName = 'RunTasksInspector';

export default RunTasksInspector;
