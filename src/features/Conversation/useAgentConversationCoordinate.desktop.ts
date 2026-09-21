import { useParams, useSearchParams } from 'react-router';

import { useResolvedAgentRouteId } from '@/features/AgentRoute/useResolvedAgentRouteId';
import { useChatStore } from '@/store/chat';

export const useAgentConversationCoordinate = () => {
  const params = useParams<{ aid?: string; topicId?: string }>();
  const [searchParams] = useSearchParams();
  const { agentId: routeAgentId } = useResolvedAgentRouteId(params.aid);
  const storeAgentId = useChatStore((s) => s.activeAgentId);

  // Surfaces that host a conversation without an `aid` route param (project
  // conversation, goal chat) bind their agent through the chat store instead.
  return [
    routeAgentId ?? storeAgentId,
    params.topicId ?? null,
    searchParams.get('thread'),
  ] as const;
};
