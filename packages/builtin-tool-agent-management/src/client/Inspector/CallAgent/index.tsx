'use client';

import { DEFAULT_AVATAR } from '@orvilo/const';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { cn } from '@/lib/utils';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { highlightTextStyles, shinyTextStyles } from '@/styles';

import type { CallAgentParams } from '../../../types';

export const CallAgentInspector = memo<BuiltinInspectorProps<CallAgentParams>>(
  ({ args, partialArgs, isArgumentsStreaming }) => {
    const { t } = useTranslation('plugin');

    const agentId = args?.agentId || partialArgs?.agentId;
    const runAsTask = args?.runAsTask || partialArgs?.runAsTask;

    // Get agent meta from store
    const agentMeta = useAgentStore((s) =>
      agentId ? agentSelectors.getAgentMetaById(agentId)(s) : undefined,
    );

    if (isArgumentsStreaming && !agentId) {
      return (
        <div className="flex items-center gap-2 overflow-hidden">
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-agent-management.apiName.callAgent')}
          </span>
        </div>
      );
    }

    const titleKey = runAsTask
      ? 'builtins.orvilo-agent-management.inspector.callAgent.task'
      : 'builtins.orvilo-agent-management.inspector.callAgent.sync';

    const agentName = agentMeta?.title || agentId;

    return (
      <div className="flex flex-row items-center gap-2 overflow-hidden">
        <span
          className={cn(
            'shrink-0 whitespace-nowrap text-muted-foreground',
            isArgumentsStreaming && shinyTextStyles.shinyText,
          )}
        >
          {t(titleKey)}
        </span>
        {agentMeta && (
          <Avatar
            avatar={agentMeta.avatar || DEFAULT_AVATAR}
            background={agentMeta.backgroundColor || 'var(--card)'}
            shape={'square'}
            size={24}
            title={agentMeta.title || undefined}
          />
        )}
        {agentName && <span className={highlightTextStyles.primary}>{agentName}</span>}
      </div>
    );
  },
);

CallAgentInspector.displayName = 'CallAgentInspector';

export default CallAgentInspector;
