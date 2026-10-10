'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { Check, X } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { highlightTextStyles, inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { InstallPluginParams, InstallPluginState } from '../../../types';

export const InstallPluginInspector = memo<
  BuiltinInspectorProps<InstallPluginParams, InstallPluginState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');

  const identifier = args?.identifier || partialArgs?.identifier;
  const displayName = pluginState?.pluginName || identifier;

  // Initial streaming state
  if (isArgumentsStreaming && !identifier) {
    return (
      <div className={inspectorTextStyles.root}>
        <span className={shinyTextStyles.shinyText}>
          {t('builtins.orvilo-agent-builder.apiName.installPlugin')}
        </span>
      </div>
    );
  }

  // Get installation result
  const isSuccess = pluginState?.success && pluginState?.installed;
  const hasResult = pluginState?.success !== undefined;

  return (
    <div className={inspectorTextStyles.root}>
      <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
        {t('builtins.orvilo-agent-builder.apiName.installPlugin')}:{' '}
      </span>
      {displayName && <span className={highlightTextStyles.primary}>{displayName}</span>}
      {!isLoading &&
        hasResult &&
        (isSuccess ? (
          <Check className="ms-1 [margin-block-end:-2px]" color={'var(--success)'} size={14} />
        ) : (
          <X className="ms-1 [margin-block-end:-2px]" color={'var(--destructive)'} size={14} />
        ))}
    </div>
  );
});

InstallPluginInspector.displayName = 'InstallPluginInspector';

export default InstallPluginInspector;
