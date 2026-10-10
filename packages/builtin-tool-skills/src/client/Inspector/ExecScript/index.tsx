'use client';

import { type BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { Check, LoaderCircle, X } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { highlightTextStyles, inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { ExecScriptParams, ExecScriptState } from '../../../types';

const styles = { statusIcon: '[margin-block-end:-2px] ms-1' };

export const ExecScriptInspector = memo<BuiltinInspectorProps<ExecScriptParams, ExecScriptState>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
    const { t } = useTranslation('plugin');

    // Show description if available, otherwise show command
    const description = args?.description || partialArgs?.description || args?.command || '';

    if (isArgumentsStreaming) {
      if (!description)
        return (
          <div className={inspectorTextStyles.root}>
            <span className={shinyTextStyles.shinyText}>
              {t('builtins.orvilo-skills.apiName.execScript')}
            </span>
          </div>
        );

      return (
        <div className={inspectorTextStyles.root}>
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-skills.apiName.execScript')}:{' '}
          </span>
          <span className={highlightTextStyles.primary}>{description}</span>
        </div>
      );
    }

    const isSuccess = pluginState?.success;
    // A command that outlived the shell's observation window has no exitCode
    // yet and reports `success: true` for the model loop (still running ≠
    // failed) — but the UI must not show a completed checkmark while the
    // command is in fact still executing (pollable via shellId).
    const isStillRunning = pluginState?.exitCode === undefined && !!pluginState?.shellId;

    return (
      <div className={inspectorTextStyles.root}>
        <span style={{ marginInlineStart: 2 }}>
          <span className={cn(isLoading && shinyTextStyles.shinyText)}>
            {t('builtins.orvilo-skills.apiName.execScript')}:{' '}
          </span>
          {description && <span className={highlightTextStyles.primary}>{description}</span>}
          {isLoading ? null : isStillRunning ? (
            <span className={cn('anticon animate-spin', styles.statusIcon)} role="img">
              <LoaderCircle fill={'transparent'} height={14} size={14} width={14} />
            </span>
          ) : pluginState?.success !== undefined ? (
            isSuccess ? (
              <Check className={styles.statusIcon} color={'var(--success)'} size={14} />
            ) : (
              <X className={styles.statusIcon} color={'var(--destructive)'} size={14} />
            )
          ) : null}
        </span>
      </div>
    );
  },
);

ExecScriptInspector.displayName = 'ExecScriptInspector';
