'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { Check, X } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { highlightTextStyles, inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { ExecuteCodeState } from '../../../types';

const styles = { statusIcon: '[margin-block-end:-2px] ms-1' };

interface ExecuteCodeParams {
  code: string;
  description: string;
  language?: 'javascript' | 'python' | 'typescript';
}

export const ExecuteCodeInspector = memo<
  BuiltinInspectorProps<ExecuteCodeParams, ExecuteCodeState>
>(({ args, partialArgs, isArgumentsStreaming, pluginState, isLoading }) => {
  const { t } = useTranslation('plugin');

  const description = args?.description || partialArgs?.description;

  if (isArgumentsStreaming) {
    if (!description)
      return (
        <div className={inspectorTextStyles.root}>
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-cloud-sandbox.apiName.executeCode')}
          </span>
        </div>
      );

    return (
      <div className={inspectorTextStyles.root}>
        <span className={shinyTextStyles.shinyText}>
          {t('builtins.orvilo-cloud-sandbox.apiName.executeCode')}:{' '}
        </span>
        <span className={highlightTextStyles.gold}>{description}</span>
      </div>
    );
  }

  return (
    <div className={inspectorTextStyles.root}>
      <span style={{ marginInlineStart: 2 }}>
        <span className={cn(isLoading && shinyTextStyles.shinyText)}>
          {t('builtins.orvilo-cloud-sandbox.apiName.executeCode')}:{' '}
        </span>
        {description && <span className={highlightTextStyles.primary}>{description}</span>}
        {isLoading ? null : pluginState?.success ? (
          <Check className={styles.statusIcon} color={'var(--success)'} size={14} />
        ) : (
          <X className={styles.statusIcon} color={'var(--destructive)'} size={14} />
        )}
      </span>
    </div>
  );
});

ExecuteCodeInspector.displayName = 'ExecuteCodeInspector';
