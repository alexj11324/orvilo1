'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { highlightTextStyles, shinyTextStyles } from '@/styles';

import type { UpdatePromptParams } from '../../../types';

export const UpdatePromptInspector = memo<BuiltinInspectorProps<UpdatePromptParams>>(
  ({ args, partialArgs, isArgumentsStreaming }) => {
    const { t } = useTranslation('plugin');

    const agentId = args?.agentId || partialArgs?.agentId;

    if (isArgumentsStreaming && !agentId) {
      return (
        <div className="flex items-center gap-2 overflow-hidden">
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-agent-management.apiName.updatePrompt')}
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
          {t('builtins.orvilo-agent-management.inspector.updatePrompt.title')}
        </span>
        {agentId && <span className={highlightTextStyles.primary}>{agentId}</span>}
      </div>
    );
  },
);

UpdatePromptInspector.displayName = 'UpdatePromptInspector';

export default UpdatePromptInspector;
