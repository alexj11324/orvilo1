'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';

import { useResolvedAgentRouteId } from '@/features/AgentRoute/useResolvedAgentRouteId';
import { selectActiveTabUrl } from '@/features/Electron/shell/activeTabUrl';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import { useChatStore } from '@/store/chat';
import { useElectronStore } from '@/store/electron';

import { resolveActiveConversationCoordinate } from './coordinate';
import { subscribeActiveConversationNavigation } from './navigation';
import { projectActiveConversationCoordinate } from './projectCoordinate';

const ActiveConversationBridge = () => {
  const params = useActiveRouteParams<{ aid?: string; gid?: string; topicId?: string }>();
  const url = useElectronStore(selectActiveTabUrl) || '/';
  const { agentId } = useResolvedAgentRouteId(params.aid);
  // `/chat` carries no agent segment — the topic owner bound into the store
  // (by TopicOwnerSync) plays the route-agent role on those routes.
  const activeAgentId = useChatStore((s) => s.activeAgentId);
  const coordinate = useMemo(
    () =>
      resolveActiveConversationCoordinate({
        activeAgentId,
        params,
        resolvedAgentId: agentId,
        url,
      }),
    [activeAgentId, agentId, params, url],
  );
  const coordinateRef = useRef(coordinate);
  coordinateRef.current = coordinate;

  useLayoutEffect(() => {
    projectActiveConversationCoordinate(coordinate);
  }, [coordinate]);

  useLayoutEffect(() => {
    return subscribeActiveConversationNavigation(() => coordinateRef.current);
  }, []);

  return null;
};

export default ActiveConversationBridge;
