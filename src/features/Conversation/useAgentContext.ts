'use client';

import { type ConversationContext } from '@orvilo/types';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { useChatStore } from '@/store/chat';
import { useDocumentStore } from '@/store/document';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import { useAgentConversationCoordinate } from './useAgentConversationCoordinate';

/**
 * Hook to get agent conversation context
 *
 * Only for agent chat page (main/thread scope).
 * Returns context for regular agent conversations.
 */
export function useAgentContext(): ConversationContext {
  const workspaceSlug = useActiveWorkspaceSlug();
  const [routeAgentId, topicId, threadId] = useAgentConversationCoordinate();
  // A blank composer (no topic bound yet) composes on behalf of the agent the
  // user picked in the composer — falling back to the last agent a send ran
  // under — rather than whichever agent's room the route happens to sit in.
  // The first message then binds that agent to the new topic.
  const [composerAgentId, lastUsedAgentId] = [
    useChatStore((s) => s.composerAgentId),
    useGlobalStore(systemStatusSelectors.lastUsedAgentId),
  ];
  const agentId =
    topicId || threadId ? routeAgentId : composerAgentId || lastUsedAgentId || routeAgentId;

  const activeTopicDocumentId = useDocumentStore((s) => {
    if (!topicId || threadId) return undefined;

    const lastTopicDocumentId = s.lastActiveTopicDocumentIdByTopicId[topicId];
    const documentIds = [s.activeDocumentId, lastTopicDocumentId].filter(Boolean) as string[];

    for (const documentId of documentIds) {
      const document = s.documents[documentId];
      if (!document) {
        if (documentId === lastTopicDocumentId) return documentId;
        continue;
      }
      if (document.sourceType === 'notebook' && document.topicId === topicId) return documentId;
    }
  });

  return {
    agentId,
    documentId: activeTopicDocumentId,
    scope: threadId ? 'thread' : 'main',
    threadId,
    topicId,
    ...(workspaceSlug ? { workspaceSlug } : {}),
  };
}
