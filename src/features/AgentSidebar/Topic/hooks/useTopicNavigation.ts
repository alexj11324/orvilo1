import { CHAT_NEW_URL, CHAT_TOPIC_URL } from '@orvilo/const';
import { useCallback, useMemo } from 'react';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { useFocusTopicPopup } from '@/features/TopicPopupGuard/useTopicPopupsRegistry';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { useActiveLocation } from '@/hooks/useActiveLocation';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import { useQueryRoute } from '@/hooks/useQueryRoute';
import { useChatStore } from '@/store/chat';
import { useGlobalStore } from '@/store/global';

import { buildPrefixedAgentRoutePath, parseAgentPathname } from '../../utils/agentPathname';

/**
 * Hook to handle topic navigation with automatic route detection
 * If in agent sub-route (e.g., /agent/:aid/profile), navigate back to chat first
 */
interface NavigateToTopicOptions {
  skipPopupFocus?: boolean;
}

export const useTopicNavigation = () => {
  const { pathname } = useActiveLocation();
  const agentRoute = useMemo(() => parseAgentPathname(pathname), [pathname]);
  const params = useActiveRouteParams<{ aid?: string; topicId?: string }>();
  const [activeAgentId, activeTopicId] = useChatStore((s) => [s.activeAgentId, s.activeTopicId]);
  const router = useQueryRoute();
  const toggleConfig = useGlobalStore((s) => s.toggleMobileTopic);
  const switchTopic = useChatStore((s) => s.switchTopic);
  const activeWorkspaceSlug = useActiveWorkspaceSlug();
  const routeAgentId = params.aid ?? agentRoute?.agentId ?? activeAgentId;
  // URL is the source of truth. Sidebar mounts at `/agent/:aid` so `params.topicId`
  // is undefined here — fall back to parsing pathname directly so consumers can compare
  // their item id against the URL's topic id without waiting for store hydration.
  const urlTopicId = params.topicId;
  const routeTopicId = params.topicId ?? activeTopicId ?? undefined;
  const focusTopicPopup = useFocusTopicPopup({ agentId: activeAgentId });

  const isInTopicContextRoute = useCallback(() => {
    if (!routeAgentId || !routeTopicId || agentRoute?.agentId !== routeAgentId) return false;

    return agentRoute.segmentsAfterAgent[0] === routeTopicId;
  }, [agentRoute, routeAgentId, routeTopicId]);

  const isInAgentSubRoute = useCallback(() => {
    if (!routeAgentId) return false;
    if (agentRoute?.agentId !== routeAgentId) return false;

    const { segmentsAfterAgent } = agentRoute;
    if (segmentsAfterAgent.length === 0) return false;

    const isExactTopicRoute =
      routeTopicId && segmentsAfterAgent.length === 1 && segmentsAfterAgent[0] === routeTopicId;

    // If pathname has more segments after /agent/:aid (or the active topic), it's a sub-route.
    return !isExactTopicRoute;
  }, [agentRoute, routeAgentId, routeTopicId]);

  const navigateToTopic = useCallback(
    async (topicId?: string, options?: NavigateToTopicOptions) => {
      if (!options?.skipPopupFocus) {
        await focusTopicPopup(topicId);
      }

      // The conversation is the navigation unit: `/chat/:topicId` resolves
      // the topic's owner agent on the route, so a row never needs the
      // owner's id — and the workspace feed can mix topics from many agents.
      // No topic id means the blank composer (`/chat/new`).
      const basePath = topicId ? CHAT_TOPIC_URL(topicId) : CHAT_NEW_URL;
      const awarePath = buildWorkspaceAwarePath(basePath, activeWorkspaceSlug);
      router.push(buildPrefixedAgentRoutePath(awarePath, agentRoute, activeWorkspaceSlug));
      switchTopic(topicId);
      toggleConfig(false);
    },
    [activeWorkspaceSlug, agentRoute, focusTopicPopup, router, switchTopic, toggleConfig],
  );

  return {
    focusTopicPopup,
    isInAgentSubRoute: isInAgentSubRoute(),
    isInTopicContextRoute: isInTopicContextRoute(),
    navigateToTopic,
    routeTopicId,
    urlTopicId,
  };
};
