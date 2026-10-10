'use client';

import { inspectorTextStyles, shinyTextStyles } from '@orvilo/shared-tool-ui/styles';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ClaudeCodeApiName, type TaskOutputArgs } from '../../types';

const styles = {
  chip: 'overflow-hidden inline-flex shrink items-center min-w-0 ms-1.5 py-px px-2 rounded-[999px] font-mono text-[12px] text-foreground text-ellipsis whitespace-nowrap bg-accent',
};

/**
 * CC's tool for reading output from a background task. The only user-relevant
 * arg is `task_id` — `block`/`timeout` are plumbing and live in the expanded
 * args view.
 */
export const TaskOutputInspector = memo<BuiltinInspectorProps<TaskOutputArgs>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading }) => {
    const { t } = useTranslation('plugin');
    const label = t(ClaudeCodeApiName.TaskOutput as any);
    const taskId = (args?.task_id ?? partialArgs?.task_id)?.trim();

    const isShiny = isArgumentsStreaming || isLoading;

    if (isArgumentsStreaming && !taskId) {
      return <div className={cn(inspectorTextStyles.root, shinyTextStyles.shinyText)}>{label}</div>;
    }

    return (
      <div className={inspectorTextStyles.root}>
        <span className={cn(isShiny && shinyTextStyles.shinyText)}>
          {taskId ? `${label}:` : label}
        </span>
        {taskId && <span className={styles.chip}>{taskId}</span>}
      </div>
    );
  },
);

TaskOutputInspector.displayName = 'ClaudeCodeTaskOutputInspector';
