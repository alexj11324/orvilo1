'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { Check } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { UpdatePromptParams, UpdatePromptState } from '../../../types';

export const UpdatePromptInspector = memo<
  BuiltinInspectorProps<UpdatePromptParams, UpdatePromptState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');

  const prompt = args?.prompt || partialArgs?.prompt;

  // Calculate length difference
  const lengthDiff = useMemo(() => {
    if (!pluginState) return null;

    const newLength = pluginState.newPrompt?.length ?? 0;
    const prevLength = pluginState.previousPrompt?.length ?? 0;
    const diff = newLength - prevLength;

    return diff;
  }, [pluginState]);

  // Initial streaming state
  if (isArgumentsStreaming && !prompt) {
    return (
      <div className={inspectorTextStyles.root}>
        <span className={shinyTextStyles.shinyText}>
          {t('builtins.orvilo-agent-builder.apiName.updatePrompt')}
        </span>
      </div>
    );
  }

  // Calculate streaming length change
  const streamingLength = prompt?.length ?? 0;
  const isSuccess = pluginState?.success;

  return (
    <div className={inspectorTextStyles.root}>
      <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
        {t('builtins.orvilo-agent-builder.apiName.updatePrompt')}
      </span>
      {/* Show length diff when completed */}
      {!isLoading && !isArgumentsStreaming && lengthDiff !== null && (
        <span
          className={cn(
            'ms-1 font-mono rounded bg-muted px-1 text-[12px]',
            lengthDiff >= 0 ? 'text-success' : 'text-destructive',
          )}
        >
          ({lengthDiff >= 0 ? '+' : ''}
          {lengthDiff}
          {t('builtins.orvilo-agent-builder.inspector.chars')})
        </span>
      )}
      {/* Show streaming length */}
      {(isArgumentsStreaming || isLoading) && streamingLength > 0 && (
        <span className="ms-1 font-mono rounded bg-muted px-1 text-[12px] text-[var(--ant-color-text-description)]">
          ({streamingLength}
          {t('builtins.orvilo-agent-builder.inspector.chars')})
        </span>
      )}
      {!isLoading && !isArgumentsStreaming && isSuccess && (
        <Check className="ms-1 [margin-block-end:-2px]" color={'var(--success)'} size={14} />
      )}
    </div>
  );
});

UpdatePromptInspector.displayName = 'UpdatePromptInspector';

export default UpdatePromptInspector;
