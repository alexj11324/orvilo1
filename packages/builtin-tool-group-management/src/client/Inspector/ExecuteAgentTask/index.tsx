'use client';

import { DEFAULT_AVATAR } from '@orvilo/const';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';
import { highlightTextStyles, shinyGroupStyles, shinyTextStyles } from '@/styles';

import type { ExecuteTaskParams } from '../../../types';

export const ExecuteAgentTaskInspector = memo<BuiltinInspectorProps<ExecuteTaskParams>>(
  ({ args, partialArgs, isArgumentsStreaming }) => {
    const { t } = useTranslation('plugin');

    const agentId = args?.agentId || partialArgs?.agentId;
    const taskTitle = args?.title || partialArgs?.title;

    // Get active group ID and agent from store
    const activeGroupId = useAgentGroupStore(agentGroupSelectors.activeGroupId);
    const agent = useAgentGroupStore((s) =>
      activeGroupId && agentId
        ? agentGroupSelectors.getAgentByIdFromGroup(activeGroupId, agentId)(s)
        : undefined,
    );

    if (isArgumentsStreaming) {
      if (!agent && !taskTitle)
        return (
          <div className="flex items-center gap-2 overflow-hidden">
            <span className={shinyTextStyles.shinyText}>
              {t('builtins.orvilo-group-management.apiName.executeAgentTask')}
            </span>
          </div>
        );
      if (agent) {
        return (
          <div
            className={cn('flex items-center gap-2 overflow-hidden', shinyGroupStyles.shinyGroup)}
          >
            <span
              className={cn(
                'shrink-0 whitespace-nowrap text-muted-foreground',
                isArgumentsStreaming && shinyTextStyles.shinyText,
              )}
            >
              {t('builtins.orvilo-group-management.inspector.executeAgentTask.assignTo')}
            </span>
            {agent && (
              <>
                <Avatar
                  avatar={agent.avatar || DEFAULT_AVATAR}
                  background={agent.backgroundColor || 'var(--card)'}
                  shape={'square'}
                  size={24}
                  title={agent.title || undefined}
                />
                <span className={cn(isArgumentsStreaming && shinyTextStyles.shinyText)}>
                  {agent?.title}
                </span>
              </>
            )}
            {taskTitle && (
              <>
                <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                  {t('builtins.orvilo-group-management.inspector.executeAgentTask.task')}
                </span>
                <span className={highlightTextStyles.primary}>{taskTitle}</span>
              </>
            )}
          </div>
        );
      }
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
          {t('builtins.orvilo-group-management.inspector.executeAgentTask.assignTo')}
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
        {agentName && <span>{agentName}</span>}
        {taskTitle && (
          <>
            <span className="shrink-0 whitespace-nowrap text-muted-foreground">
              {t('builtins.orvilo-group-management.inspector.executeAgentTask.task')}
            </span>
            <span className={highlightTextStyles.primary}>{taskTitle}</span>
          </>
        )}
      </div>
    );
  },
);
