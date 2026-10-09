'use client';

import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { conversationSelectors, useConversationStore } from '@/features/Conversation';
import SuggestQuestions from '@/features/SuggestQuestions';

const AgentBuilderWelcome = memo(() => {
  const { t } = useTranslation('chat');
  const agentId = useConversationStore(conversationSelectors.agentId);

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
        <AssigneeAvatar agentId={agentId} size={78} />
        <div className="text-[24px] font-bold">{t('pageCopilot.title')}</div>
        <SuggestQuestions count={3} mode="write" />
      </div>
    </>
  );
});

export default AgentBuilderWelcome;
