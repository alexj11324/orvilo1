'use client';

import { inspectorTextStyles, shinyTextStyles } from '@orvilo/shared-tool-ui/styles';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { GitForkIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { EnterWorktreeArgs, ExitWorktreeArgs } from '../../types';

type InspectorPhase = 'completed' | 'failed' | 'idle' | 'loading';

const CREATE_LABEL_KEYS = {
  completed: 'builtins.orvilo-claude-code.worktree.create.completed',
  failed: 'builtins.orvilo-claude-code.worktree.create.failed',
  idle: 'builtins.orvilo-claude-code.worktree.create.idle',
  loading: 'builtins.orvilo-claude-code.worktree.create.loading',
} as const;

const ENTER_LABEL_KEYS = {
  completed: 'builtins.orvilo-claude-code.worktree.enter.completed',
  failed: 'builtins.orvilo-claude-code.worktree.enter.failed',
  idle: 'builtins.orvilo-claude-code.worktree.enter.idle',
  loading: 'builtins.orvilo-claude-code.worktree.enter.loading',
} as const;

const EXIT_LABEL_KEYS = {
  completed: 'builtins.orvilo-claude-code.worktree.exit.completed',
  failed: 'builtins.orvilo-claude-code.worktree.exit.failed',
  idle: 'builtins.orvilo-claude-code.worktree.exit.idle',
  loading: 'builtins.orvilo-claude-code.worktree.exit.loading',
} as const;

const REMOVE_LABEL_KEYS = {
  completed: 'builtins.orvilo-claude-code.worktree.remove.completed',
  failed: 'builtins.orvilo-claude-code.worktree.remove.failed',
  idle: 'builtins.orvilo-claude-code.worktree.remove.idle',
  loading: 'builtins.orvilo-claude-code.worktree.remove.loading',
} as const;

const styles = {
  chip: 'overflow-hidden inline-flex shrink gap-1.5 items-center min-w-0 max-w-[min(420px,60vw)] ms-1.5 py-0.5 px-2.5 rounded-[999px] bg-accent',
  icon: 'shrink-0 text-[var(--ant-color-text-description)]',
  leadingIcon: 'me-1.5',
  risk: 'shrink-0 ms-1.5 py-px px-1.5 rounded-[999px] text-[12px] text-destructive bg-[var(--ant-color-error-bg)]',
  target:
    'overflow-hidden min-w-0 font-mono text-[12px] text-foreground text-ellipsis whitespace-nowrap',
};

const resolvePhase = (
  isArgumentsStreaming: boolean | undefined,
  isLoading: boolean | undefined,
  hasError: boolean,
  hasResult: boolean,
): InspectorPhase => {
  if (isArgumentsStreaming || isLoading) return 'loading';
  if (hasError) return 'failed';
  if (hasResult) return 'completed';
  return 'idle';
};

interface WorktreeTargetProps {
  target: string;
}

const WorktreeTarget = memo<WorktreeTargetProps>(({ target }) => (
  <span className={styles.chip} title={target}>
    <GitForkIcon className={styles.icon} size={12} />
    <span className={styles.target}>{target}</span>
  </span>
));

WorktreeTarget.displayName = 'ClaudeCodeWorktreeTarget';

export const EnterWorktreeInspector = memo<BuiltinInspectorProps<EnterWorktreeArgs>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading, result }) => {
    const { t } = useTranslation('plugin');
    const name = args?.name?.trim() || partialArgs?.name?.trim();
    const path = args?.path?.trim() || partialArgs?.path?.trim();
    const target = name || path;
    const phase = resolvePhase(
      isArgumentsStreaming,
      isLoading,
      Boolean(result?.error),
      Boolean(result),
    );
    const label = t((path ? ENTER_LABEL_KEYS : CREATE_LABEL_KEYS)[phase]);

    return (
      <div className={inspectorTextStyles.root}>
        <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
          {label}
        </span>
        {target && <WorktreeTarget target={target} />}
      </div>
    );
  },
);

EnterWorktreeInspector.displayName = 'ClaudeCodeEnterWorktreeInspector';

export const ExitWorktreeInspector = memo<BuiltinInspectorProps<ExitWorktreeArgs>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading, result }) => {
    const { t } = useTranslation('plugin');
    const action = args?.action || partialArgs?.action;
    const discardChanges = args?.discard_changes ?? partialArgs?.discard_changes;
    const phase = resolvePhase(
      isArgumentsStreaming,
      isLoading,
      Boolean(result?.error),
      Boolean(result),
    );
    const label = t((action === 'remove' ? REMOVE_LABEL_KEYS : EXIT_LABEL_KEYS)[phase]);

    return (
      <div className={inspectorTextStyles.root}>
        <GitForkIcon className={cn(styles.icon, styles.leadingIcon)} size={12} />
        <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
          {label}
        </span>
        {action === 'remove' && discardChanges && (
          <span className={styles.risk}>
            {t('builtins.orvilo-claude-code.worktree.discardChanges')}
          </span>
        )}
      </div>
    );
  },
);

ExitWorktreeInspector.displayName = 'ClaudeCodeExitWorktreeInspector';
