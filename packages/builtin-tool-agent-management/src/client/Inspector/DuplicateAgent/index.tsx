'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { highlightTextStyles, shinyTextStyles } from '@/styles';

import type { DuplicateAgentParams } from '../../../types';

export const DuplicateAgentInspector = memo<BuiltinInspectorProps<DuplicateAgentParams>>(
  ({ args, partialArgs, isArgumentsStreaming }) => {
    const { t } = useTranslation('plugin');

    const agentId = args?.agentId || partialArgs?.agentId;
    const newTitle = args?.newTitle || partialArgs?.newTitle;

    if (isArgumentsStreaming && !agentId) {
      return (
        <div className="flex items-center gap-2 overflow-hidden">
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-agent-management.apiName.duplicateAgent')}
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
          {t('builtins.orvilo-agent-management.inspector.duplicateAgent.title')}
        </span>
        <span className={highlightTextStyles.primary}>{newTitle || agentId}</span>
      </div>
    );
  },
);

DuplicateAgentInspector.displayName = 'DuplicateAgentInspector';

export default DuplicateAgentInspector;
