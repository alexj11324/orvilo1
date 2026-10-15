'use client';

import { inspectorTextStyles, shinyTextStyles } from '@orvilo/shared-tool-ui/styles';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { clsx as cx } from 'cn';
import { Check, X } from 'lucide-react';
import { memo } from 'react';

import { Github } from '../../../brand-icons/src';
import { getGhSubcommand, type GithubRunCommandArgs, type GithubRunCommandState } from './utils';

const styles = {
  chip: 'inline-flex min-w-0 shrink items-center gap-1.5 overflow-hidden rounded-(--radius-chip) bg-muted px-2.5 py-0.5',
  command: 'min-w-0 truncate font-mono text-xs leading-5 text-foreground',
  ghPrefix: 'me-1.5 shrink-0 font-mono text-xs leading-5 text-muted-foreground',
  icon: 'me-1.5 shrink-0 text-muted-foreground',
  statusIcon: 'ms-1',
};

const GithubRunCommandInspector = memo<
  BuiltinInspectorProps<GithubRunCommandArgs, GithubRunCommandState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
  const command = args?.command || partialArgs?.command || '';
  const description = args?.description || partialArgs?.description || '';
  const subcommand = getGhSubcommand(command);
  const label = description || subcommand;

  const pulse = isArgumentsStreaming || isLoading;
  const isSuccess = pluginState?.success ?? pluginState?.exitCode === 0;
  const hasResult = !pulse && pluginState && pluginState.success !== undefined;

  return (
    <div className={inspectorTextStyles.root}>
      <Github className={styles.icon} size={16} />
      <span className={cx(styles.ghPrefix, pulse && shinyTextStyles.shinyText)}>gh</span>
      {label && (
        <span className={styles.chip}>
          <span className={styles.command}>{label}</span>
        </span>
      )}
      {hasResult ? (
        isSuccess ? (
          <Check className={cx(styles.statusIcon, 'text-success-text')} size={16} />
        ) : (
          <X className={cx(styles.statusIcon, 'text-destructive-text')} size={16} />
        )
      ) : null}
    </div>
  );
});

GithubRunCommandInspector.displayName = 'GithubRunCommandInspector';

export default GithubRunCommandInspector;
