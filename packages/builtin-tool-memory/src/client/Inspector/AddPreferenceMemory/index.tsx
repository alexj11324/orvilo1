'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { Check } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { highlightTextStyles, inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { AddPreferenceMemoryParams, AddPreferenceMemoryState } from '../../../types';

export const AddPreferenceMemoryInspector = memo<
  BuiltinInspectorProps<AddPreferenceMemoryParams, AddPreferenceMemoryState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');

  const title = args?.title || partialArgs?.title;

  // Initial streaming state
  if (isArgumentsStreaming && !title) {
    return (
      <div className={inspectorTextStyles.root}>
        <span className={shinyTextStyles.shinyText}>
          {t('builtins.orvilo-user-memory.apiName.addPreferenceMemory')}
        </span>
      </div>
    );
  }

  const isSuccess = pluginState?.memoryId;

  return (
    <div className={inspectorTextStyles.root}>
      <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
        {t('builtins.orvilo-user-memory.apiName.addPreferenceMemory')}
      </span>
      {title && (
        <>
          :<span className={highlightTextStyles.primary}>{title}</span>
        </>
      )}
      {!isLoading && isSuccess && (
        <Check className="[margin-block-end:-2px] ms-1" color="var(--success)" size={14} />
      )}
    </div>
  );
});

AddPreferenceMemoryInspector.displayName = 'AddPreferenceMemoryInspector';

export default AddPreferenceMemoryInspector;
