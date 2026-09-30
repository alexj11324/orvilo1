'use client';

import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { DEFAULT_INBOX_AVATAR } from '@/const/index';
import { conversationSelectors, useConversationStore } from '@/features/Conversation';
import SuggestQuestions from '@/features/SuggestQuestions';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';

const AgentBuilderWelcome = memo(() => {
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
        <Avatar avatar={agent?.avatar || DEFAULT_INBOX_AVATAR} shape={'square'} size={78} />
        <div className="text-[24px] font-bold">{t('pageCopilot.title')}</div>
        <SuggestQuestions count={3} mode="write" />
      </div>
    </>
  );
});

export default AgentBuilderWelcome;
