'use client';

import { Markdown } from '@lobehub/ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { conversationSelectors, useConversationStore } from '@/features/Conversation';
import { type SuggestMode } from '@/features/SuggestQuestions';

import SuggestionChips from './SuggestionChips';

interface AgentBuilderWelcomeProps {
  disabled?: boolean;
  mode?: SuggestMode;
}

const AgentBuilderWelcome = memo<AgentBuilderWelcomeProps>(
  ({ disabled, mode = 'agentBuilder' }) => {
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
          <div className="text-[24px] font-bold">{t('agentBuilder.title')}</div>
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
