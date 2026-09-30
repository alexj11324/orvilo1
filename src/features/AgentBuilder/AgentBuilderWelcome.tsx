'use client';

import { Markdown } from '@lobehub/ui';
import { Avatar, Text } from '@lobehub/ui/base-ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { DEFAULT_INBOX_AVATAR } from '@/const/index';
import { conversationSelectors, useConversationStore } from '@/features/Conversation';
import { type SuggestMode } from '@/features/SuggestQuestions';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';

import SuggestionChips from './SuggestionChips';

interface AgentBuilderWelcomeProps {
  disabled?: boolean;
  mode?: SuggestMode;
}

const AgentBuilderWelcome = memo<AgentBuilderWelcomeProps>(
  ({ disabled, mode = 'agentBuilder' }) => {
    const { t } = useTranslation('chat');
    const agentId = useConversationStore(conversationSelectors.agentId);
    const agent = useAgentStore(agentByIdSelectors.getAgentConfigById(agentId));

    return (
      <>
        <div className="flex flex-col flex-1" />
        <div
          className="flex flex-col gap-3"
          style={{
            width: '100%',

            paddingBottom: 16,
          }}
        >
          <Avatar avatar={agent.avatar || DEFAULT_INBOX_AVATAR} shape={'square'} size={78} />
          <Text fontSize={24} weight={'bold'}>
            {t('agentBuilder.title')}
          </Text>
          <Markdown fontSize={14} variant={'chat'}>
            {t('agentBuilder.welcome')}
          </Markdown>
          <SuggestionChips builderAgentId={agentId} count={3} disabled={disabled} mode={mode} />
        </div>
      </>
    );
  },
);

export default AgentBuilderWelcome;
