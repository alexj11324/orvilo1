import type {
  CollaborationServerMessage,
  InvalidateNotice,
  RoomPublishEnvelope,
  ServerActivityEvent,
} from '@orvilo/types';
import { roomKey } from '@orvilo/types';

/** Outbox row shape consumed by the projection (teammate-owned schema). */
export interface OutboxEventRow {
  aggregateId: string;
  aggregateType: string;
  createdAt: Date;
  eventId: string;
  eventType: string;
  id: string;
  payload: unknown;
  /** Tenant column on the outbox row; payloads may repeat it, never required to. */
  workspaceId?: string | null;
}

export interface RoomDelivery {
  publish: RoomPublishEnvelope;
  /** Wire room key (`{scope}:{id}`). */
  room: string;
}

const ROOM_SCOPES = new Set(['project', 'task', 'workspace']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const payloadUserId = (payload: unknown): string | null => {
  if (!isRecord(payload)) return null;
  const candidate = payload.userId ?? payload.memberUserId;
  return typeof candidate === 'string' ? candidate : null;
};

const isActivityEventPayload = (payload: unknown): payload is ServerActivityEvent =>
  isRecord(payload) &&
  typeof payload.eventId === 'string' &&
  typeof payload.action === 'string' &&
  typeof payload.phase === 'string' &&
  isRecord(payload.actor) &&
  isRecord(payload.target);

const invalidateNotice = (aggregateType: string, aggregateId: string): InvalidateNotice => ({
  entity: aggregateType === 'project' ? 'project' : aggregateType === 'workspace' ? 'workspace' : 'task',
  entityId: aggregateId,
  type: 'invalidate',
});

/**
 * Project one outbox event to zero-or-more room deliveries.
 *
 * Audience contract: every business event degrades to a minimal
 * `{type:'invalidate'}` notice — no titles, ids beyond the aggregate, or
 * payloads cross the room boundary. Task-aggregated events stay inside their
 * per-task room; project rooms only see project-aggregated events, so a
 * private task's existence never leaks into the wider project audience.
 * `collaboration.activity` rows already carry a server-built
 * ServerActivityEvent payload and pass through as `{type:'activity'}`.
 *
 * `workspace.member.removed|suspended` additionally emits a `kick` — the
 * revocation control that tears down the member's live connections; presence
 * TTL alone is not the revocation mechanism.
 */
export const projectOutboxEvent = (event: OutboxEventRow): RoomDelivery[] => {
  if (!ROOM_SCOPES.has(event.aggregateType)) return [];
  const room = roomKey({ id: event.aggregateId, scope: event.aggregateType as 'project' | 'task' | 'workspace' });
  const deliveries: RoomDelivery[] = [];

  // Revocation rides ahead of the notice so a connected-but-removed member
  // loses the socket before any further room traffic reaches them.
  if (
    event.aggregateType === 'workspace' &&
    (event.eventType === 'workspace.member.removed' || event.eventType === 'workspace.member.suspended')
  ) {
    const userId = payloadUserId(event.payload);
    if (userId) {
      deliveries.push({
        publish: { kind: 'kick', reason: event.eventType, userId },
        room,
      });
    }
  }

  if (event.eventType === 'collaboration.activity' && isActivityEventPayload(event.payload)) {
    deliveries.push({
      publish: { kind: 'broadcast', message: { event: event.payload, type: 'activity' } },
      room,
    });
    return deliveries;
  }

  deliveries.push({
    publish: {
      kind: 'broadcast',
      message: invalidateNotice(event.aggregateType, event.aggregateId) as CollaborationServerMessage,
    },
    room,
  });

  return deliveries;
};

/**
 * History side of the room contract: synthesize a ServerActivityEvent from a
 * delivered outbox row for `collaboration.snapshot` replay. Rows that already
 * carry a full activity payload pass through verbatim; other domain events
 * collapse to a minimal committed marker — enough for clients to know the
 * entity moved, never enough to leak content.
 */
export const outboxRowToActivityEvent = (row: OutboxEventRow): ServerActivityEvent | null => {
  if (isActivityEventPayload(row.payload)) {
    const event = row.payload;
    return { ...event, eventId: event.eventId || row.eventId };
  }
  if (!ROOM_SCOPES.has(row.aggregateType)) return null;

  const payload = isRecord(row.payload) ? row.payload : {};
  const actorPayload = isRecord(payload.actor) ? payload.actor : null;
  const occurredAt = row.createdAt.toISOString();

  return {
    action: row.eventType,
    actor: {
      id: typeof actorPayload?.id === 'string' ? actorPayload.id : 'system',
      kind:
        actorPayload?.kind === 'human' || actorPayload?.kind === 'agent'
          ? actorPayload.kind
          : 'system',
      ...(typeof actorPayload?.name === 'string' ? { name: actorPayload.name } : {}),
      ...(typeof actorPayload?.onBehalfOfUserId === 'string'
        ? { onBehalfOfUserId: actorPayload.onBehalfOfUserId }
        : {}),
    },
    entityVersion: typeof payload.entityVersion === 'number' ? payload.entityVersion : 0,
    eventId: row.eventId,
    expiresAt: occurredAt,
    occurredAt,
    phase: 'committed',
    projectId: typeof payload.projectId === 'string' ? payload.projectId : '',
    target: {
      anchor: 'card',
      entityId: row.aggregateId,
      entityType: row.aggregateType === 'project' ? 'project' : 'task',
    },
    workspaceId:
      typeof row.workspaceId === 'string'
        ? row.workspaceId
        : typeof payload.workspaceId === 'string'
          ? payload.workspaceId
          : '',
  };
};
