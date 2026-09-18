import { EVENT_CONSUMERS } from '@orvilo/types';
import { isRecord } from '@orvilo/utils/object';
import { eq } from 'drizzle-orm';

import { EventConsumerReceiptModel } from '@/database/models/eventConsumerReceipt';
import { NotificationModel } from '@/database/models/notification';
import { allocateFeedRevision } from '@/database/models/notificationFeed';
import type { EventOutboxItem } from '@/database/schemas/eventOutbox';
import { eventOutbox } from '@/database/schemas/eventOutbox';
import type { OrviloDatabase } from '@/database/type';

const RETRY_DELAY_MS = 30_000;
const VISIBILITY_TIMEOUT_MS = 5 * 60 * 1000;

interface ProjectionTarget {
  actionKind?: string;
  actionRequestId?: string;
  content: string;
  episodeKey: string;
  kind: 'action' | 'update';
  recipientUserId: string;
  resourceId?: string;
  resourceType?: string;
  title: string;
  type: string;
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const payloadRecord = (payload: unknown): Record<string, unknown> =>
  isRecord(payload) ? payload : {};

const resolveTargets = (row: EventOutboxItem): ProjectionTarget[] => {
  const payload = payloadRecord(row.payload);
  const actorId = asString(payload.userId) ?? asString(payload.memberUserId);
  const assignee = asString(payload.assigneeUserId) ?? asString(payload.toId);
  const approver = asString(payload.approverUserId);
  const recipient = asString(payload.recipientId) ?? asString(payload.recipientUserId);
  const taskId = row.aggregateType === 'task' ? row.aggregateId : asString(payload.taskId);
  const title = asString(payload.title) ?? row.eventType;
  const content = asString(payload.content) ?? asString(payload.action) ?? row.eventType;

  const targets: ProjectionTarget[] = [];
  const push = (userId: string | undefined, extra: Omit<ProjectionTarget, 'recipientUserId'>) => {
    if (!userId || userId === actorId) return;
    targets.push({ ...extra, recipientUserId: userId });
  };

  if (approver) {
    push(approver, {
      actionKind: 'acp_permission',
      actionRequestId: asString(payload.approvalId) ?? row.eventId,
      content,
      episodeKey: `action:${asString(payload.approvalId) ?? row.eventId}`,
      kind: 'action',
      resourceId: taskId,
      resourceType: taskId ? 'task' : undefined,
      title: title === row.eventType ? 'Approval required' : title,
      type: 'acp_permission',
    });
    return targets;
  }

  if (row.eventType.includes('transfer') && recipient) {
    push(recipient, {
      actionKind: 'resource_transfer',
      actionRequestId: asString(payload.requestId) ?? row.eventId,
      content,
      episodeKey: `transfer:${asString(payload.requestId) ?? row.eventId}`,
      kind: 'action',
      title: 'Resource transfer request',
      type: 'resource_transfer',
    });
    return targets;
  }

  if (assignee) {
    push(assignee, {
      content,
      episodeKey: `task:${taskId ?? row.aggregateId}:assignee`,
      kind: 'update',
      resourceId: taskId,
      resourceType: taskId ? 'task' : undefined,
      title: title === row.eventType ? 'Task assigned to you' : title,
      type: 'task_assigned',
    });
  }

  if (row.eventType.includes('comment') && taskId) {
    const mentioned = Array.isArray(payload.mentionedUserIds) ? payload.mentionedUserIds : [];
    for (const userId of mentioned) {
      if (typeof userId !== 'string') continue;
      push(userId, {
        content,
        episodeKey: `task:${taskId}:mention`,
        kind: 'update',
        resourceId: taskId,
        resourceType: 'task',
        title: 'You were mentioned',
        type: 'mention',
      });
    }
  }

  return targets;
};

export class NotificationProjectionService {
  constructor(private readonly db: OrviloDatabase) {}

  drainPending = async (limit = 200) => {
    const receipts = new EventConsumerReceiptModel(this.db);
    let drained = 0;
    for (;;) {
      const claimed = await receipts.claimPending({
        consumer: EVENT_CONSUMERS.NOTIFICATION_PROJECTION,
        limit,
        visibilityTimeoutMs: VISIBILITY_TIMEOUT_MS,
      });
      for (const receipt of claimed) {
        try {
          await this.projectReceipt(receipt.eventId);
          await receipts.markDelivered(receipt.id);
          drained += 1;
        } catch (error) {
          await receipts.markFailed(receipt.id, { retryDelayMs: RETRY_DELAY_MS });
          console.error('[notification-projection] failed', receipt.eventId, error);
        }
      }
      if (claimed.length < limit) return drained;
    }
  };

  private projectReceipt = async (eventId: string) => {
    const [row] = await this.db
      .select()
      .from(eventOutbox)
      .where(eq(eventOutbox.eventId, eventId))
      .limit(1);
    if (!row) return;

    const targets = resolveTargets(row);
    for (const target of targets) {
      await this.db.transaction(async (tx) => {
        const model = new NotificationModel(tx as typeof this.db, target.recipientUserId, {
          workspaceId: row.workspaceId ?? null,
        });
        const first = await model.recordEventReceipt(tx, {
          consumer: EVENT_CONSUMERS.NOTIFICATION_PROJECTION,
          eventId,
          kind: target.kind,
          recipientUserId: target.recipientUserId,
        });
        if (!first) return;

        const revision = await allocateFeedRevision(tx, {
          userId: target.recipientUserId,
          workspaceId: row.workspaceId,
        });
        const bumped = await model.bumpEpisode(tx, {
          content: target.content,
          episodeKey: target.episodeKey,
          feedRevision: revision,
          recipientUserId: target.recipientUserId,
          title: target.title,
        });
        if (bumped) return;

        await model.create({
          actionKind: target.actionKind,
          actionRequestId: target.actionRequestId,
          activityVersion: 1,
          category: target.kind === 'action' ? 'pending' : 'workspace',
          content: target.content,
          dedupeKey: `${target.episodeKey}:${target.recipientUserId}`,
          episodeKey: target.episodeKey,
          kind: target.kind,
          lastActivityAt: new Date(),
          latestFeedRevision: revision,
          resourceId: target.resourceId,
          resourceType: target.resourceType,
          sourceEventId: eventId,
          title: target.title,
          type: target.type,
          workspaceId: row.workspaceId ?? null,
        });
      });
    }
  };
}
