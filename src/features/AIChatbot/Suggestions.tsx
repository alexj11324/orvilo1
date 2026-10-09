'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Suggestion, Suggestions as AISuggestions } from '@/components/ai-elements/suggestion';
import { useConversationResourceAccess } from '@/features/Conversation/hooks/useConversationResourceAccess';
import {
  contextSelectors,
  messageStateSelectors,
  useConversationStore,
} from '@/features/Conversation/store';
import { useAgentStore } from '@/store/agent';
import { followUpActionSelectors, useFollowUpActionStore } from '@/store/followUpAction';

const EXAMPLE_KEYS = [
  'examples.createProject.title',
  'examples.researchTopic.title',
  'examples.draftUpdate.title',
] as const;
const EMPTY_QUESTIONS: string[] = [];

/** The example's footer suggestions use configured questions and real generated follow-ups. */
export default function Suggestions() {
  const { t } = useTranslation('chat');
  const { canUseResource, isAccessLoading } = useConversationResourceAccess();
  const context = useConversationStore((s) => s.context);
  const conversationKey = useConversationStore(contextSelectors.conversationKey);
  const empty = useConversationStore((s) => s.displayMessages.length === 0);
  const latestAssistantId = useConversationStore(
    (s) =>
      s.displayMessages.findLast((m) => m.role === 'assistant' || m.role === 'assistantGroup')?.id,
  );
  const childIdsKey = useConversationStore((s) =>
    s.displayMessages
      .find((m) => m.id === latestAssistantId)
      ?.children?.map((c) => c.id)
      .join('|'),
  );
  const busy = useConversationStore(messageStateSelectors.isInputVisiblyLoading);
  const fillInputMessage = useConversationStore((s) => s.fillInputMessage);
  const openingQuestions = useAgentStore(
    (s) =>
      (context.agentId ? s.agentMap[context.agentId]?.openingQuestions : undefined) ??
      EMPTY_QUESTIONS,
  );
  const selector = useMemo(
    () =>
      followUpActionSelectors.chipsFor({
        childIdsKey,
        conversationKey,
        messageId: latestAssistantId,
      }),
    [childIdsKey, conversationKey, latestAssistantId],
  );
  const followUps = useFollowUpActionStore(selector);
  const suggestions = empty
    ? (openingQuestions.length ? openingQuestions : EXAMPLE_KEYS.map((key) => t(key))).map(
        (text) => ({ label: text, message: text }),
      )
    : followUps;

  if (busy || suggestions.length === 0 || !canUseResource || isAccessLoading) return null;
  return (
    <AISuggestions className="px-4">
      {suggestions.map(({ label, message }, index) => (
        <Suggestion key={`${index}-${message}`} suggestion={message} onClick={fillInputMessage}>
          {label}
        </Suggestion>
      ))}
    </AISuggestions>
  );
}
