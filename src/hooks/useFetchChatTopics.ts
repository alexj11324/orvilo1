import type { TopicQuerySortBy } from '@orvilo/types';

import { MAIN_SIDEBAR_EXCLUDE_TRIGGERS } from '@/const/topic';
import { useAgentTopicGroupMode } from '@/features/AgentSidebar/Topic/hooks/useAgentTopicGroupMode';
import { useFetchTopics } from '@/hooks/useFetchTopics';
import { useAgentStore } from '@/store/agent';
import { builtinAgentSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

// Only user-archived conversations leave the feed: a finished (`completed`)
// conversation stays listed exactly where it was — completion is lifecycle
// metadata, not an implicit archive. Hiding is the archive action's job.
const EXCLUDE_STATUSES_ARCHIVED = ['archived'];

/**
 * The one query shape a `topicDataMap` bucket is allowed to hold. The bucket is
 * keyed by container (`agent_<id>`) only — not by filters — so every fetch that
 * targets a container overwrites whatever the previous one put there. Two
 * mounted fetches with different filters therefore fight, and the looser one
 * wins whenever it lands last.
 *
 * Keep all filter derivation here so no call site can drift: same args means
 * the same SWR key, which means SWR dedupes them into a single request.
 */
const useChatTopicListQuery = () => {
  const activeGroupId = useChatStore((s) => s.activeGroupId);
  const { topicGroupMode } = useAgentTopicGroupMode();

  // "Group by status" ordering is resolved server-side so the highest-priority
  // topics (awaiting human → running → active) stay on the first page even when
  // the list is paginated — client-side grouping over a partial page is exactly
  // what made the previous approach flaky. Only the agent sidebar supports it;
  // group sessions keep the default updatedAt ordering.
  const sortBy: TopicQuerySortBy | undefined =
    !activeGroupId && topicGroupMode === 'byStatus' ? 'status' : undefined;

  return {
    excludeStatuses: EXCLUDE_STATUSES_ARCHIVED,
    excludeTriggers: MAIN_SIDEBAR_EXCLUDE_TRIGGERS,
    sortBy,
  };
};

/**
 * Canonical topic fetch for chat sidebars (agent + group), driven by the active
 * session. Use {@link useFetchAgentChatTopics} for a panel that names its agent
 * explicitly.
 *
 * Extend {@link useChatTopicListQuery} when adding more preference-driven topic
 * params; don't spread them across individual components.
 */
export const useFetchChatTopics = () => useFetchTopics(useChatTopicListQuery());

/**
 * The conversation-first sidebar feed: one workspace-wide list containing
 * every visible non-group conversation, whatever agent owns it. Agent
 * identity degrades to weak row metadata on each item (`topic.agentId`),
 * never a fetch filter — the topic is the navigation unit.
 *
 * Feeds the `topicDataMap.workspace` bucket that the sidebar selectors read
 * outside a group session. `pageSize` bounds the page for now; cursor
 * pagination replaces it in a later PR.
 */
export const useWorkspaceConversationFeed = () => {
  const query = useChatTopicListQuery();
  const pageSize = useGlobalStore(systemStatusSelectors.topicPageSize);
  const useFetchTopicsHook = useChatStore((s) => s.useFetchTopics);

  const { isValidating, data } = useFetchTopicsHook(true, {
    ...query,
    pageSize,
    scope: 'workspace',
  });

  return {
    // isRevalidating: has cached data, updating in background
    isRevalidating: isValidating && !!data,
  };
};

/**
 * Same canonical list, for the secondary conversation panels that carry their
 * own topic picker (goal chat, task manager, page copilot, agent builder).
 *
 * These share `topicDataMap[agent_<id>]` with the sidebar, so they must ask for
 * exactly the same list: fetching unfiltered here used to overwrite the
 * sidebar's bucket with system-owned topics (task runs, cron, docs, evals) the
 * moment such a panel mounted next to it.
 */
export const useFetchAgentChatTopics = (agentId?: string) => {
  const query = useChatTopicListQuery();
  const inboxAgentId = useAgentStore(builtinAgentSelectors.inboxAgentId);
  const pageSize = useGlobalStore(systemStatusSelectors.topicPageSize);

  return useChatStore((s) => s.useFetchTopics)(!!agentId, {
    agentId,
    ...query,
    isInbox: !!inboxAgentId && agentId === inboxAgentId,
    pageSize,
  });
};
