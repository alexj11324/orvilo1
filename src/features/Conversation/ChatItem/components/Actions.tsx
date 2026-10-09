import { memo } from 'react';

import { MessageActions } from '@/components/ai-elements/message';
import { useAgentStore } from '@/store/agent';
import { builtinAgentSelectors } from '@/store/agent/selectors';
import { isDev } from '@/utils/env';

import { contextSelectors, useConversationStore } from '../../store';
import type { ChatItemProps } from '../type';

export interface ActionsProps {
  actionAddon?: ChatItemProps['actionAddon'];
  actions: ChatItemProps['actions'];
  placement?: ChatItemProps['placement'];
}

const Actions = memo<ActionsProps>(({ actionAddon, placement, actions }) => {
  const onboardingAgentId = useAgentStore(builtinAgentSelectors.webOnboardingAgentId);
  const conversationAgentId = useConversationStore(contextSelectors.agentId);
  if (!isDev && onboardingAgentId && conversationAgentId === onboardingAgentId) return null;

  const isUser = placement === 'right';
  return (
    <MessageActions
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      {!isUser && actionAddon}
      {actions}
      {isUser && actionAddon}
    </MessageActions>
  );
});

export default Actions;
