import type { OrviloDatabase } from '@orvilo/database';
import type { WorkspaceAuditAction } from '@/database/models/workspaceAuditLog';
import { EventOutboxModel, newEventId } from '@/database/models/eventOutbox';
import { WorkspaceAuditLogModel } from '@/database/models/workspaceAuditLog';

/** Audit actions emitted by the teammates lifecycle; the column is plain text. */
export const recordAudit = async (
  db: OrviloDatabase,
  params: {
    action: WorkspaceAuditAction;
    ipAddress?: string;
    metadata?: Record<string, unknown>;
    resourceId?: string;
    resourceType?: string;
    userId: string | null;
    workspaceId: string;
  },
) => {
  await new WorkspaceAuditLogModel(db).create({
    action: params.action,
    ipAddress: params.ipAddress,
    metadata: params.metadata,
    resourceId: params.resourceId,
    resourceType: params.resourceType,
    userId: params.userId,
    workspaceId: params.workspaceId,
  });
};

/**
 * Append a domain event to the transactional outbox inside the caller's
 * transaction — at-least-once delivery to mail/realtime workers keys off
 * `eventId`, so callers never fabricate their own ids.
 */
export const emitWorkspaceEvent = async (
  tx: OrviloDatabase,
  params: {
    aggregateId: string;
    aggregateType: string;
    eventType: string;
    payload: Record<string, unknown>;
    workspaceId?: string;
  },
) => {
  await new EventOutboxModel(tx).insertOutboxEvent(tx, {
    aggregateId: params.aggregateId,
    aggregateType: params.aggregateType,
    eventId: newEventId(),
    eventType: params.eventType,
    payload: params.payload,
    workspaceId: params.workspaceId,
  });
};
