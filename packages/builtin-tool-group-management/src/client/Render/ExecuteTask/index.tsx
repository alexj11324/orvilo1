'use client';

import { Text } from '@lobehub/ui/base-ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { Clock } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { ExecuteTaskParams, ExecuteTaskState } from '../../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  agentTitle: css`
    color: ${cssVar.colorTextSecondary};
  `,
  container: css`
    padding-block: 12px;
    border-radius: ${cssVar.borderRadius};
  `,
  taskContent: css`
    padding-block: 8px;
    padding-inline: 12px;
    border-radius: ${cssVar.borderRadius};
    background: ${cssVar.colorFillTertiary};
  `,
  timeout: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
}));

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
          <Text className={styles.taskContent} style={{ margin: 0 }}>
            {args.instruction}
          </Text>
        )}
      </div>
    );
  },
);

ExecuteTaskRender.displayName = 'ExecuteTaskRender';

export default ExecuteTaskRender;
