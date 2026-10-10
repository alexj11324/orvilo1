'use client';

import { inspectorTextStyles, shinyTextStyles } from '@orvilo/shared-tool-ui/styles';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { Check, Monitor as MonitorIcon, X } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ClaudeCodeApiName, type MonitorArgs } from '../../types';

const styles = {
  chip: 'overflow-hidden inline-flex shrink gap-1.5 items-center min-w-0 ms-1.5 py-0.5 px-2.5 rounded-[999px] bg-accent',
  command:
    'overflow-hidden min-w-0 font-mono text-[12px] text-foreground text-ellipsis whitespace-nowrap',
  description:
    'overflow-hidden min-w-0 text-[12px] text-foreground text-ellipsis whitespace-nowrap',
  monitorIcon: 'shrink-0 text-[var(--ant-color-text-description)]',
  statusIcon: 'ms-1',
  timeout: "shrink-0 ms-2 [font-feature-settings:'tnum'] text-[var(--ant-color-text-description)]",
};

const formatTimeout = (ms: number | undefined): string | undefined => {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return undefined;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  if (minutes < 60) {
    return remSeconds > 0 ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
};

/**
 * Dedicated inspector for CC's long-running `Monitor` tool ().
 *
 * Visual contract:
 *   [Monitor] <MonitorIcon>  <description-or-command>  · <timeout>   [✓/✗]
 *
 * Uses the lucide `Monitor` (screen) icon so the chip iconography matches
 * the tool name. Falls back to `command` when the model omits
 * `description`; renders a code-styled chip in that case to make the
 * shell snippet recognizable.
 */
export const MonitorInspector = memo<BuiltinInspectorProps<MonitorArgs>>(
  ({ args, partialArgs, isArgumentsStreaming, pluginState, isLoading }) => {
    const { t } = useTranslation('plugin');
    const label = t(ClaudeCodeApiName.Monitor as any);

    const source = args ?? partialArgs;
    const description = source?.description?.trim();
    const command = source?.command?.trim();
    const timeoutLabel = formatTimeout(source?.timeout_ms);

    const isShiny = isArgumentsStreaming || isLoading;

    // Nothing useful to show yet — keep the spinner-y label only.
    if (isArgumentsStreaming && !description && !command) {
      return <div className={cn(inspectorTextStyles.root, shinyTextStyles.shinyText)}>{label}</div>;
    }

    // Prefer description; fall back to command (rendered monospace).
    const showAsCommand = !description && !!command;
    const chipText = description || command;

    const success = (pluginState as { success?: boolean } | undefined)?.success;
    const exitCode = (pluginState as { exitCode?: number } | undefined)?.exitCode;
    const isSuccess = success === true || exitCode === 0;
    const isError = success === false || (typeof exitCode === 'number' && exitCode !== 0);

    return (
      <div className={inspectorTextStyles.root}>
        <span className={cn(isShiny && shinyTextStyles.shinyText)}>{label}:</span>
        {chipText && (
          <span className={styles.chip}>
            <MonitorIcon className={styles.monitorIcon} size={12} />
            <span className={showAsCommand ? styles.command : styles.description}>{chipText}</span>
          </span>
        )}
        {timeoutLabel && <span className={styles.timeout}>· {timeoutLabel}</span>}
        {isLoading ? null : isSuccess ? (
          <Check className={styles.statusIcon} color={'var(--success)'} size={14} />
        ) : isError ? (
          <X className={styles.statusIcon} color={'var(--destructive)'} size={14} />
        ) : null}
      </div>
    );
  },
);

MonitorInspector.displayName = 'ClaudeCodeMonitorInspector';
