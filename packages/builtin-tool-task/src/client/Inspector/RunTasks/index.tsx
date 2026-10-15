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
    'shrink-0 rounded-(--radius-chip) bg-warning-wash px-2 py-px text-xs font-medium text-warning-text',
  failedBadge:
    'shrink-0 rounded-(--radius-chip) bg-destructive-wash px-2 py-px text-xs text-destructive-text',
  identifierChip:
    'shrink-0 rounded-(--radius-chip) bg-accent px-2 py-px font-mono text-xs text-muted-foreground',
  moreBadge: 'shrink-0 text-xs text-foreground-tertiary',
  separator: 'shrink-0 text-foreground-quaternary',
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
          <Play className="text-warning-text" size={12} />
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-task.apiName.runTasks')}
          </span>
        </div>
      );
    }

    return (
      <div className={cn(inspectorTextStyles.root, 'flex-wrap gap-1.5')}>
        <Play className="text-warning-text" size={12} />
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
