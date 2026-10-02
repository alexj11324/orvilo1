'use client';

import { memo, useEffect, useLayoutEffect } from 'react';
import { useParams } from 'react-router';

import { useInitAgentConfig } from '@/hooks/useInitAgentConfig';
import { topicService } from '@/services/topic';
import { useAgentStore } from '@/store/agent';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

/**
 * Binds the conversation-stable `/chat` routes to the topic's owner agent.
 *
 * On `/agent/:aid/...` the URL's agent segment writes `activeAgentId` via
 * `useAgentIdStoreSync`; `/chat/:topicId` has no agent segment — the owner
 * comes from the topic itself:
 *
 * - `/chat/:topicId` — `activeAgentId` tracks `topic.agentId`, so a Continue
 *   handoff (which flips `topic.agentId` on the same row) re-binds execution
 *   to the new agent without any navigation. History never moves.
 * - `/chat/new` — `activeAgentId` clears so the composer falls back to the
 *   explicit pick / `lastUsedAgentId` chain, exactly like a fresh room; the
 *   resolved fallback still hydrates its agent config.
 * - Deep links to a topic the store hasn't loaded yet resolve the owner via
 *   `topicService.getTopicDetail` once; when the topics fetch later lands the
 *   selector takes over.
 */
const TopicOwnerSync = memo(() => {
  const params = useParams<{ topicId?: string }>();
  const routeTopicId = params.topicId ?? null;
  const topicAgentId = useChatStore((s) =>
    routeTopicId ? topicSelectors.getTopicById(routeTopicId)(s)?.agentId : undefined,
  );
  // The agent whose config the blank composer should hydrate — the explicit
  // pick first, then the last-used default, mirroring `useAgentContext`'s
  // composer chain.
  const [composerAgentId, lastUsedAgentId] = [
    useChatStore((s) => (routeTopicId ? undefined : s.composerAgentId)),
    useGlobalStore(systemStatusSelectors.lastUsedAgentId),
  ];
  const configAgentId = routeTopicId
    ? topicAgentId
    : (composerAgentId ?? lastUsedAgentId ?? undefined);

  // Hydrate the bound agent's config — `AgentIdSync` does this for
  // `/agent/:aid`; `/chat` resolves the same id from the topic instead.
  useInitAgentConfig(configAgentId);

  // Resolve the owner on deep links where the topic isn't in any loaded
  // bucket yet. `getTopicById` also scans the detail map, so once the fetch
  // lands the selector path takes over and this effect stays inert.
  useEffect(() => {
    if (!routeTopicId || topicAgentId !== undefined) return;
    let cancelled = false;

    void topicService.getTopicDetail(routeTopicId).then((topic) => {
      if (cancelled || !topic?.agentId) return;
      useChatStore.setState(
        { activeAgentId: topic.agentId },
        false,
        'TopicOwnerSync/resolveDeepLink',
      );
      useAgentStore.setState(
        { activeAgentId: topic.agentId },
        false,
        'TopicOwnerSync/resolveDeepLink',
      );
    });

    return () => {
      cancelled = true;
    };
  }, [routeTopicId, topicAgentId]);

  useLayoutEffect(() => {
    const next = routeTopicId ? (topicAgentId ?? undefined) : undefined;
    if (useChatStore.getState().activeAgentId !== next) {
      useChatStore.setState({ activeAgentId: next }, false, 'TopicOwnerSync/syncAgentId');
    }
    if (useAgentStore.getState().activeAgentId !== next) {
      useAgentStore.setState({ activeAgentId: next }, false, 'TopicOwnerSync/syncAgentId');
    }
  }, [routeTopicId, topicAgentId]);

  useLayoutEffect(
    () => () => {
      useChatStore.setState({ activeAgentId: undefined }, false, 'TopicOwnerSync/cleanup');
      useAgentStore.setState({ activeAgentId: undefined }, false, 'TopicOwnerSync/cleanup');
    },
    [],
  );

  return null;
});

TopicOwnerSync.displayName = 'TopicOwnerSync';

export default TopicOwnerSync;
