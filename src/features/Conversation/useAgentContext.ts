'use client';

import { type ConversationContext } from '@orvilo/types';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { useDefaultAgent, useOfferedAgentId } from '@/features/DefaultAgent/useDefaultAgent';
import { useChatStore } from '@/store/chat';
import { useDocumentStore } from '@/store/document';

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
  // Explicit composer picks and Agent deep links take precedence; blank Chat
  // otherwise starts with the configured Orchestrator.
  const composerAgentId = useChatStore((s) => s.composerAgentId);
  const defaultAgentId = useDefaultAgent()?.agentId;
  const blankAgentId = useOfferedAgentId(composerAgentId || routeAgentId || defaultAgentId);
  const agentId = topicId || threadId ? routeAgentId : blankAgentId;

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
    agentId: agentId ?? '',
    documentId: activeTopicDocumentId,
    scope: threadId ? 'thread' : 'main',
    threadId,
    topicId,
    ...(workspaceSlug ? { workspaceSlug } : {}),
  };
}
