/**
 * Topic scope types
 * - 'agent': Agent main topic list (default when only agentId)
 * - 'group': Group main topic list (when groupId without agentId)
 * - 'group_agent': Agent topic list within a group (when both groupId and agentId)
 * - 'workspace': Workspace-wide conversation feed (every visible non-group
 *   topic regardless of owning agent — explicit scope only, never auto-detected)
 */
export type TopicMapScope = 'agent' | 'group' | 'group_agent' | 'workspace';

/**
 * The single `topicDataMap` key the workspace conversation feed lives under.
 * Exported so selectors/dispatch can recognize (and dual-write into) the feed
 * bucket without re-deriving the string.
 */
export const WORKSPACE_TOPIC_MAP_KEY = 'workspace';

export interface TopicMapKeyInput {
  /**
   * Agent ID - used for agent sessions or agent within group
   */
  agentId?: string;
  /**
   * Group ID - used for group sessions
   */
  groupId?: string;
  /**
   * Explicit scope override (auto-detected if not provided)
   */
  scope?: TopicMapScope;
}

/**
 * Generate a unique key for topic data map based on session context
 *
 * Auto-detection rules:
 * - If groupId && agentId: scope = 'group_agent'
 * - If groupId only: scope = 'group'
 * - If agentId only: scope = 'agent'
 * - 'workspace' is never auto-detected — it must be passed explicitly since it
 *   deliberately ignores the active agent/group.
 *
 * Key format:
 * - Agent session: `agent_{agentId}`
 * - Group session: `group_{groupId}`
 * - Agent within group: `group_agent_{groupId}_{agentId}`
 * - Workspace feed: `workspace`
 */
export const topicMapKey = (input: TopicMapKeyInput): string => {
  const { agentId, groupId, scope: explicitScope } = input;

  // Auto-detect scope if not explicitly provided
  let scope: TopicMapScope;
  if (explicitScope) {
    scope = explicitScope;
  } else if (groupId && agentId) {
    scope = 'group_agent';
  } else if (groupId) {
    scope = 'group';
  } else {
    scope = 'agent';
  }

  switch (scope) {
    case 'workspace': {
      return WORKSPACE_TOPIC_MAP_KEY;
    }
    case 'group_agent': {
      return `group_agent_${groupId}_${agentId}`;
    }
    case 'group': {
      return `group_${groupId}`;
    }

    default: {
      return `agent_${agentId}`;
    }
  }
};
