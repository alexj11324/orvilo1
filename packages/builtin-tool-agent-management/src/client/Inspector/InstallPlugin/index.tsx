'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { highlightTextStyles, shinyTextStyles } from '@/styles';

import type { InstallPluginParams } from '../../../types';

export const InstallPluginInspector = memo<BuiltinInspectorProps<InstallPluginParams>>(
  ({ args, partialArgs, isArgumentsStreaming }) => {
    const { t } = useTranslation('plugin');

    const identifier = args?.identifier || partialArgs?.identifier;

    if (isArgumentsStreaming && !identifier) {
      return (
        <div className="flex items-center gap-2 overflow-hidden">
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-agent-management.apiName.installPlugin')}
          </span>
        </div>
      );
    }

    return (
      <div className="flex flex-row items-center gap-2 overflow-hidden">
        <span
          className={cn(
            'shrink-0 whitespace-nowrap text-muted-foreground',
            isArgumentsStreaming && shinyTextStyles.shinyText,
          )}
        >
          {t('builtins.orvilo-agent-management.inspector.installPlugin.title')}
        </span>
        {identifier && <span className={highlightTextStyles.primary}>{identifier}</span>}
      </div>
    );
  },
);

InstallPluginInspector.displayName = 'InstallPluginInspector';

export default InstallPluginInspector;
