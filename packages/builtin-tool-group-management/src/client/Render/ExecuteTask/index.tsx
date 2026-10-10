'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { Clock } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { ExecuteTaskParams, ExecuteTaskState } from '../../../types';

const styles = {
  agentTitle: 'text-muted-foreground',
  container: 'rounded-[var(--ant-border-radius)] py-3',
  taskContent: 'rounded-[var(--ant-border-radius)] bg-accent px-3 py-2',
  timeout: 'text-[12px] text-[var(--ant-color-text-tertiary)]',
};

/**
 * ExecuteTask Render component for Group Management tool
 * Read-only display of the task execution request
 */
const ExecuteTaskRender = memo<BuiltinRenderProps<ExecuteTaskParams, ExecuteTaskState>>(
  ({ args }) => {
    const { t } = useTranslation('tool');

    const timeoutMinutes = args?.timeout ? Math.round(args.timeout / 60_000) : 30;

    return (
      <div className={cn('flex', 'flex-col', 'gap-3', styles.container)}>
        {/* Header: Agent info + Timeout */}
        <div className="flex items-center gap-3 justify-between">
          <div className="flex items-center flex-1 gap-3" style={{ minWidth: 0 }}>
            <span className={styles.agentTitle}>{args?.title}</span>
          </div>
          <div className={cn('flex', 'items-center', 'gap-1', styles.timeout)}>
            <Clock size={14} />
            <span>
              {timeoutMinutes} {t('agentGroupManagement.executeTask.intervention.timeoutUnit')}
            </span>
          </div>
        </div>

        {/* Instruction content (read-only) */}
        {args?.instruction && (
          <div className={cn(styles.taskContent)} style={{ margin: 0 }}>
            {args.instruction}
          </div>
        )}
      </div>
    );
  },
);

ExecuteTaskRender.displayName = 'ExecuteTaskRender';

export default ExecuteTaskRender;
