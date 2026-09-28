import type { AgentSignalScope } from '../base/types';

/**
 * Producer metadata used to derive a stable source-event scope key.
 */
export interface AgentSignalProducerScopeInput {
  /** Optional assistant or agent identifier for broad agent-user scoped events. */
  agentId?: string;
  /** Optional task identifier. Used when no topic is available. */
  taskId?: string;
  /** Optional Orvilo topic identifier. Takes precedence over task metadata. */
  topicId?: string;
  /** Optional user identifier for broad authenticated scopes. */
  userId?: string;
}

/**
 * Task identity used when an AgentSignal chain is scoped to async task execution.
 */
export interface AgentSignalTaskScopeKeyInput {
  /** Stable task identifier. */
  taskId: string;
}

/**
 * Topic identity used when an AgentSignal chain is scoped to one Orvilo topic.
 */
export interface AgentSignalTopicScopeKeyInput {
  /** Stable Orvilo topic identifier. */
  topicId: string;
}

/**
 * Agent/user identity used when no narrower topic or task scope is available.
 */
export interface AgentSignalUserAgentScopeKeyInput {
  /** Stable assistant or agent identifier. */
  agentId: string;
  /** Stable user identifier. */
  userId: string;
}

/**
 * User identity used as the broadest authenticated AgentSignal scope.
 */
export interface AgentSignalUserScopeKeyInput {
  /** Stable user identifier. */
  userId: string;
}

const joinScopeKey = (prefix: string, ...parts: string[]) => `${prefix}:${parts.join(':')}`;

const pickString = (input: Record<string, unknown>, key: string) => {
  const value = input[key];

  return typeof value === 'string' ? value : undefined;
};

/**
 * Builds stable scope keys for AgentSignal source events and runtime chains.
 *
 * Use when:
 * - Normalizing source events before dedupe or workflow handoff
 * - Routing runtime chains into topic, task, or user lanes
 *
 * Expects:
 * - Input identifiers are already trusted by the caller
 *
 * Returns:
 * - A deterministic scope key string
 */
export const AgentSignalScopeKey = {
  forAgentUser: (input: AgentSignalUserAgentScopeKeyInput) =>
    joinScopeKey('agent', input.agentId, 'user', input.userId),
  forTask: (input: AgentSignalTaskScopeKeyInput) => joinScopeKey('task', input.taskId),
  forTopic: (input: AgentSignalTopicScopeKeyInput) => joinScopeKey('topic', input.topicId),
  forUser: (input: AgentSignalUserScopeKeyInput) => joinScopeKey('user', input.userId),
  fromProducerInput: (input: AgentSignalProducerScopeInput) => {
    if (input.topicId) return AgentSignalScopeKey.forTopic({ topicId: input.topicId });
    if (input.taskId) return AgentSignalScopeKey.forTask({ taskId: input.taskId });

    if (input.agentId && input.userId) {
      return AgentSignalScopeKey.forAgentUser({ agentId: input.agentId, userId: input.userId });
    }

    if (input.userId) return AgentSignalScopeKey.forUser({ userId: input.userId });

    return 'fallback:global';
  },
  fromRuntimeScope: (scope: AgentSignalScope) => {
    if (scope.topicId) return AgentSignalScopeKey.forTopic({ topicId: scope.topicId });
    if (scope.taskId) return AgentSignalScopeKey.forTask({ taskId: scope.taskId });
    if (scope.agentId) {
      return AgentSignalScopeKey.forAgentUser({ agentId: scope.agentId, userId: scope.userId });
    }

    return AgentSignalScopeKey.forUser({ userId: scope.userId });
  },
} as const;

/**
 * Resolves the default scope key for a source-event payload.
 *
 * Before:
 * - `{ topicId: "topic-1" }`
 *
 * After:
 * - `"topic:topic-1"`
 */
export const getSourceEventScopeKey = (input: Record<string, unknown>) => {
  return AgentSignalScopeKey.fromProducerInput({
    agentId: pickString(input, 'agentId'),
    taskId: pickString(input, 'taskId'),
    topicId: pickString(input, 'topicId'),
    userId: pickString(input, 'userId'),
  });
};
