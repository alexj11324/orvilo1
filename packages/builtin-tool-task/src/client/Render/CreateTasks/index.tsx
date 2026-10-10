'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { CreateTaskParams, CreateTasksParams, CreateTasksState } from '../../../types';

const styles = {
  failedBadge:
    'shrink-0 rounded-[999px] bg-[var(--ant-color-error-bg)] px-2 py-px text-[12px] text-destructive',
  header: 'flex items-center gap-2 px-3 py-2 [border-block-end:1px_solid_var(--sidebar-border)]',
  headerCount: 'text-[13px] font-medium text-foreground',
  identifier:
    'shrink-0 rounded-[4px] bg-accent px-1.5 py-px font-mono text-[12px] text-muted-foreground',
  index: 'w-[18px] shrink-0 text-[12px] text-[var(--ant-color-text-quaternary)] text-end',
  row: 'flex min-w-0 items-center gap-2',
  taskBody: 'flex min-w-0 flex-1 flex-col gap-1',
  taskItem:
    'flex items-start gap-2 px-3 py-2.5 [border-block-end:1px_dashed_var(--sidebar-border)] last:[border-block-end:none]',
  instruction: 'line-clamp-2 text-[12px] leading-[1.5] text-[var(--ant-color-text-tertiary)]',
  title: 'text-[13px] leading-[1.4] text-foreground',
};

export const CreateTasksRender = memo<BuiltinRenderProps<CreateTasksParams, CreateTasksState>>(
  ({ args, pluginState }) => {
    const { t } = useTranslation('plugin');

    const items: CreateTaskParams[] = args?.tasks ?? [];
    const results = pluginState?.results ?? [];

    if (items.length === 0 && results.length === 0) return null;

    const rows = items.length > 0 ? items : results.map((r) => ({ instruction: '', name: r.name }));
    const failedCount = pluginState?.failed ?? results.filter((r) => !r.success).length;

    return (
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--sidebar-border)',
          borderRadius: 'var(--ant-border-radius)',
          width: '100%',
        }}
      >
        <div className={styles.header}>
          <span className={styles.headerCount}>
            {t('builtins.orvilo-task.createTasks.count', { count: rows.length })}
          </span>
          {failedCount > 0 && (
            <span className={styles.failedBadge}>
              {t('builtins.orvilo-task.createTasks.failedCount', { count: failedCount })}
            </span>
          )}
        </div>
        {rows.map((task, index) => {
          const result = results[index];
          const identifier = result?.identifier;
          const failed = result && result.success === false;

          return (
            <div className={styles.taskItem} key={`${identifier ?? index}-${task.name}`}>
              <div className={styles.index}>{index + 1}.</div>
              <div className={styles.taskBody}>
                <div className={styles.row}>
                  {identifier && <span className={styles.identifier}>{identifier}</span>}
                  <div className={`truncate ${styles.title}`}>{task.name}</div>
                </div>
                {task.instruction && <div className={styles.instruction}>{task.instruction}</div>}
                {failed && (
                  <span className="text-[11px] text-destructive">{result?.error ?? 'Failed'}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  },
);

CreateTasksRender.displayName = 'CreateTasksRender';

export default CreateTasksRender;
