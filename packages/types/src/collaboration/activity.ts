import type { CollaborationActor } from './actor';

/**
 * Lifecycle of a domain action as surfaced to collaborators. Only actions that
 * actually committed emit `committed` — proposals, in-flight work and failures
 * are distinct phases, never presented as done.
 */
export type ActivityPhase = 'committed' | 'failed' | 'proposed' | 'started';

export type SemanticAnchor = 'assignee' | 'card' | 'delivery' | 'dependencies' | 'status';

export interface SemanticTarget {
  anchor: SemanticAnchor;
  entityId: string;
  entityType: 'project' | 'task';
}

/**
 * Authoritative activity event projected to rooms and rendered as the agent
 * action cursor / activity pulse. Produced by the outbox projection from
 * committed domain records — the wire copy of a fact, not the fact itself.
 */
export interface ServerActivityEvent {
  /** Server-whitelisted domain action id, e.g. `task.status.changed`. */
  action: string;
  actor: CollaborationActor;
  /** Monotonic version of the target entity when the event was recorded. */
  entityVersion: number;
  eventId: string;
  /** Ephemeral animation deadline — history survives past this. */
  expiresAt: string;
  occurredAt: string;
  phase: ActivityPhase;
  projectId: string;
  target: SemanticTarget;
  taskTopicId?: string;
  workspaceId: string;
}

/**
 * Minimal invalidation hint for rooms whose audience must not learn entity
 * details — clients re-fetch through the authorized API instead of receiving
 * the payload in-band.
 */
export interface InvalidateNotice {
  entity: 'project' | 'task' | 'workspace';
  entityId: string;
  type: 'invalidate';
}
