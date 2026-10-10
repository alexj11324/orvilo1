'use client';

import type { RunCommandState } from '@orvilo/tool-runtime';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { Check, SquareChevronRight, X } from 'lucide-react';
import { type ComponentType, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '../../styles';
import { getRunCommandDisplayCommand } from '../../utils/runCommand';

const styles = {
  chip: 'inline-flex min-w-0 shrink items-center gap-1.5 overflow-hidden rounded-[999px] bg-accent px-2.5 py-0.5 ms-1.5',
  command: 'min-w-0 truncate font-mono text-[12px] text-foreground',
  leadingIcon: 'shrink-0 text-[var(--ant-color-text-description)] me-1.5',
  statusIcon: 'shrink-0 ms-1',
  terminalIcon: 'shrink-0 text-[var(--ant-color-text-description)]',
};

interface RunCommandArgs {
  background?: boolean;
  command: string;
  description?: string;
  timeout?: number;
}

export interface RunCommandInspectorProps extends BuiltinInspectorProps<
  RunCommandArgs,
  RunCommandState
> {
  /**
   * Program brand icon (e.g. Node.js / Git / Python). When provided it leads the whole row —
   * placed before the label — and the command chip drops its terminal glyph. When omitted, the
   * default terminal glyph stays inside the command chip.
   */
  icon?: ComponentType<{ className?: string; size?: number }>;
  /** i18n key for the API name label, e.g. 'builtins.orvilo-local-system.apiName.runCommand' */
  translationKey: string;
}

export const RunCommandInspector = memo<RunCommandInspectorProps>(
  ({
    args,
    partialArgs,
    isArgumentsStreaming,
    pluginState,
    isLoading,
    translationKey,
    icon: BrandIcon,
  }) => {
    const { t } = useTranslation('plugin');

    const command = getRunCommandDisplayCommand(args?.command || partialArgs?.command);
    const description = args?.description || partialArgs?.description || command;

    // Brand icon leads the row (before the label); otherwise the terminal glyph sits in the chip.
    const leading = BrandIcon ? <BrandIcon className={styles.leadingIcon} size={14} /> : null;
    const chipIcon = BrandIcon ? null : (
      <SquareChevronRight className={styles.terminalIcon} size={14} />
    );

    if (isArgumentsStreaming) {
      if (!description)
        return (
          <div className={inspectorTextStyles.root}>
            {leading}
            <span className={shinyTextStyles.shinyText}>{t(translationKey as any)}</span>
          </div>
        );

      return (
        <div className={inspectorTextStyles.root}>
          {leading}
          <span className={shinyTextStyles.shinyText}>{t(translationKey as any)}:</span>
          <span className={styles.chip}>
            {chipIcon}
            <span className={styles.command}>{description}</span>
          </span>
        </div>
      );
    }

    const isSuccess = pluginState?.success || pluginState?.exitCode === 0;

    return (
      <div className={inspectorTextStyles.root}>
        {leading}
        <span className={cn(isLoading && shinyTextStyles.shinyText)}>
          {t(translationKey as any)}:
        </span>
        {description && (
          <span className={styles.chip}>
            {chipIcon}
            <span className={styles.command}>{description}</span>
          </span>
        )}
        {isLoading ? null : pluginState?.success !== undefined ? (
          isSuccess ? (
            <Check className={styles.statusIcon} color={'var(--success)'} size={14} />
          ) : (
            <X className={styles.statusIcon} color={'var(--destructive)'} size={14} />
          )
        ) : null}
      </div>
    );
  },
);

RunCommandInspector.displayName = 'RunCommandInspector';

/**
 * Factory to create a RunCommandInspector with a bound translation key.
 * Use this in each package's inspector registry to avoid wrapper components.
 */
export const createRunCommandInspector = (translationKey: string) => {
  const Inspector = memo<BuiltinInspectorProps<RunCommandArgs, RunCommandState>>((props) => (
    <RunCommandInspector {...props} translationKey={translationKey} />
  ));
  Inspector.displayName = 'RunCommandInspector';
  return Inspector;
};
