'use client';

import { DEFAULT_AVATAR } from '@orvilo/const';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';
import { highlightTextStyles, shinyTextStyles } from '@/styles';

import type { SpeakParams } from '../../../types';

export const SpeakInspector = memo<BuiltinInspectorProps<SpeakParams>>(
  ({ args, partialArgs, isArgumentsStreaming }) => {
    const { t } = useTranslation('plugin');

    const agentId = args?.agentId || partialArgs?.agentId;

    // Get active group ID and agent from store
    const activeGroupId = useAgentGroupStore(agentGroupSelectors.activeGroupId);
    const agent = useAgentGroupStore((s) =>
      activeGroupId && agentId
        ? agentGroupSelectors.getAgentByIdFromGroup(activeGroupId, agentId)(s)
        : undefined,
    );

    if (isArgumentsStreaming && !agent) {
      return (
        <div className="flex items-center gap-2 overflow-hidden">
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-group-management.apiName.speak')}
          </span>
        </div>
      );
    }

    const agentName = agent?.title || agentId;

    return (
      <div className="flex items-center gap-2 overflow-hidden">
        <span
          className={cn(
            'shrink-0 whitespace-nowrap text-muted-foreground',
            isArgumentsStreaming && shinyTextStyles.shinyText,
          )}
        >
          {t('builtins.orvilo-group-management.inspector.speak.title')}
        </span>
        {agent && (
          <Avatar
            avatar={agent.avatar || DEFAULT_AVATAR}
            background={agent.backgroundColor || 'var(--card)'}
            shape={'square'}
            size={24}
            title={agent.title || undefined}
          />
        )}
        {agentName && <span className={highlightTextStyles.primary}>{agentName}</span>}
      </div>
    );
  },
);

SpeakInspector.displayName = 'SpeakInspector';

export default SpeakInspector;
