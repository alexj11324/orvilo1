import { type ChatTopicStatus, TOPIC_STATUSES } from '@orvilo/types';

/**
 * Statuses the mobile conversation list ships: every state except `archived`.
 * Archived conversations stay reachable from the agent's own topic drawer;
 * the tab-level feed is for conversations a user might still open.
 */
export const MOBILE_TOPIC_STATUSES: ChatTopicStatus[] = TOPIC_STATUSES.filter(
  (status) => status !== 'archived',
);

/** Minimal shape a row needs — `TopicListItem` and `ChatTopic` both satisfy it. */
export interface MobileTopicInput {
  agentId?: null | string;
  id: string;
  runStartedAt?: Date | null | string;
  status?: ChatTopicStatus | null;
  title: string;
  updatedAt: number;
}

export interface MobileTopicRow {
  agentId: string;
  id: string;
  runStartedAt: Date | null | string | undefined;
  status: ChatTopicStatus | null | undefined;
  title: string;
  updatedAt: number;
}

/**
 * One row per conversation on the mobile 会话 tab.
 *
 * Two guards keep the list honest:
 *
 * - `agentId` is required — a row navigates to `/agent/:aid/:topicId`, so a
 *   topic with no resolvable agent parent has no destination to open.
 * - ids dedupe: if a feed ever emits the same topic twice, the list still
 *   paints one row per conversation instead of stacked duplicates.
 */
export const toMobileTopicRows = (topics: MobileTopicInput[]): MobileTopicRow[] => {
  const seen = new Set<string>();
  const rows: MobileTopicRow[] = [];

  for (const topic of topics) {
    if (!topic.agentId || seen.has(topic.id)) continue;
    seen.add(topic.id);
    rows.push({
      agentId: topic.agentId,
      id: topic.id,
      runStartedAt: topic.runStartedAt,
      status: topic.status,
      title: topic.title,
      updatedAt: topic.updatedAt,
    });
  }

  return rows;
};
