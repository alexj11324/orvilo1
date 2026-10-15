'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { Check, X } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { RunTasksItemResult, RunTasksParams, RunTasksState } from '../../../types';

const styles = {
  failedBadge:
    'shrink-0 rounded-(--radius-chip) bg-destructive-wash px-2 py-px text-xs text-destructive',
  header: 'flex items-center gap-2 px-3 py-2 [border-block-end:1px_solid_var(--sidebar-border)]',
  headerCount: 'text-(length:--text-dense) font-medium text-foreground',
  identifier:
    'shrink-0 rounded-(--radius-chip) bg-accent px-1.5 py-px font-mono text-xs text-muted-foreground',
  index: 'w-4.5 shrink-0 text-xs text-foreground-quaternary text-end',
  row: 'flex min-w-0 items-center gap-2',
  taskBody: 'flex min-w-0 flex-1 flex-col gap-1',
  taskItem:
    'flex items-start gap-2 px-3 py-2.5 [border-block-end:1px_dashed_var(--sidebar-border)] last:[border-block-end:none]',
  meta: 'truncate font-mono text-xs text-foreground-tertiary',
};

export const RunTasksRender = memo<BuiltinRenderProps<RunTasksParams, RunTasksState>>(
  ({ args, pluginState }) => {
    const { t } = useTranslation('plugin');

    const identifiers = args?.identifiers ?? [];
    const results = pluginState?.results ?? [];

    if (identifiers.length === 0 && results.length === 0) return null;

    const rows: { identifier: string; result?: RunTasksItemResult }[] =
      results.length > 0
        ? results.map((r) => ({ identifier: r.identifier, result: r }))
        : identifiers.map((identifier) => ({ identifier }));
    const failedCount = pluginState?.failed ?? results.filter((r) => !r.success).length;

    return (
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--sidebar-border)',
          borderRadius: 'var(--radius-card)',
          width: '100%',
        }}
      >
        <div className={styles.header}>
          <span className={styles.headerCount}>
            {t('builtins.orvilo-task.runTasks.count', { count: rows.length })}
          </span>
          {failedCount > 0 && (
            <span className={styles.failedBadge}>
              {t('builtins.orvilo-task.runTasks.failedCount', { count: failedCount })}
            </span>
          )}
        </div>
        {rows.map((row, index) => {
          const { result } = row;
          const success = result?.success === true;
          const failedRow = result?.success === false;

          return (
            <div className={styles.taskItem} key={`${row.identifier}-${index}`}>
              <div className={styles.index}>{index + 1}.</div>
              <div className={styles.taskBody}>
                <div className={styles.row}>
                  <span className={styles.identifier}>{row.identifier}</span>
                  {success && <Check size={16} style={{ color: 'var(--success)' }} />}
                  {failedRow && <X size={16} style={{ color: 'var(--destructive)' }} />}
                </div>
                {result?.topicId && <span className={styles.meta}>topic {result.topicId}</span>}
                {failedRow && (
                  <span className="text-xs text-destructive">{result?.error || 'Failed'}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  },
);

RunTasksRender.displayName = 'RunTasksRender';

export default RunTasksRender;
