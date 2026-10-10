'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { Check } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { highlightTextStyles, inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { RemoveIdentityMemoryParams, RemoveIdentityMemoryState } from '../../../types';

export const RemoveIdentityMemoryInspector = memo<
  BuiltinInspectorProps<RemoveIdentityMemoryParams, RemoveIdentityMemoryState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');

  const id = args?.id || partialArgs?.id;

  // Initial streaming state
  if (isArgumentsStreaming && !id) {
    return (
      <div className={inspectorTextStyles.root}>
        <span className={shinyTextStyles.shinyText}>
          {t('builtins.orvilo-user-memory.apiName.removeIdentityMemory')}
        </span>
      </div>
    );
  }

  const isSuccess = pluginState?.identityId;

  return (
    <div className={inspectorTextStyles.root}>
      <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
        {t('builtins.orvilo-user-memory.apiName.removeIdentityMemory')}
      </span>
      {id && (
        <>
          :<span className={highlightTextStyles.warning}>{id}</span>
        </>
      )}
      {!isLoading && isSuccess && (
        <Check className="[margin-block-end:-2px] ms-1" color="var(--success)" size={14} />
      )}
    </div>
  );
});

RemoveIdentityMemoryInspector.displayName = 'RemoveIdentityMemoryInspector';

export default RemoveIdentityMemoryInspector;
