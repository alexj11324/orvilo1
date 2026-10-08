import { EVENT_CONSUMERS, type NotificationMetadata } from '@orvilo/types';
import { isRecord } from '@orvilo/utils/object';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { EventConsumerReceiptModel } from '@/database/models/eventConsumerReceipt';
import { NotificationModel } from '@/database/models/notification';
import { allocateFeedRevision } from '@/database/models/notificationFeed';
import { TaskModel } from '@/database/models/task';
import {
  agents,
  taskComments,
  tasks,
  taskTopics,
  topics,
  users,
  workspaceMembers,
} from '@/database/schemas';
import type { EventOutboxItem } from '@/database/schemas/eventOutbox';
import { eventOutbox } from '@/database/schemas/eventOutbox';
import { taskSubscriptions } from '@/database/schemas/workAttention';
import type { OrviloDatabase } from '@/database/type';
import { extractMentionedUserIds } from '@/server/utils/commentMentions';

const RETRY_DELAY_MS = 30_000;
const VISIBILITY_TIMEOUT_MS = 5 * 60 * 1000;

interface ProjectionTarget {
  actionKind?: string;
  actionRequestId?: string;
  content: string;
  episodeKey: string;
  kind: 'action' | 'update';
  metadata?: NotificationMetadata;
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

export const resolveNotificationTargets = (row: EventOutboxItem): ProjectionTarget[] => {
  const payload = payloadRecord(row.payload);
  const actorId = asString(payload.userId) ?? asString(payload.memberUserId);
  const assignee = asString(payload.assigneeUserId) ?? asString(payload.toId);
  const approver = asString(payload.approverUserId);
  const recipient = asString(payload.recipientId) ?? asString(payload.recipientUserId);
  const toUserId = asString(payload.toUserId);
  const transferId = asString(payload.transferId);
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

  // Ownership-transfer events must not fall through to resource_transfer:
  // eventType contains "transfer" and the payload uses toUserId/transferId.
  if (
    row.eventType.startsWith('workspace.ownership_transfer') ||
    row.eventType === 'workspace.ownership.transferred'
  ) {
    if (row.eventType === 'workspace.ownership_transfer.requested') {
      push(toUserId, {
        actionKind: 'workspace_ownership_transfer',
        actionRequestId: transferId ?? row.eventId,
        content,
        episodeKey: `workspace-ownership:${transferId ?? row.eventId}`,
        kind: 'action',
        resourceId: row.workspaceId ?? row.aggregateId,
        resourceType: 'workspace',
        title: 'Workspace ownership transfer request',
        type: 'workspace_ownership_transfer',
      });
    }
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

  /** Recipients come from the current Issue and subscriptions, never the whole workspace. */
  private resolveIssueTargets = async (row: EventOutboxItem): Promise<ProjectionTarget[]> => {
    const payload = payloadRecord(row.payload);
    const [task] = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.id, row.aggregateId),
          row.workspaceId ? eq(tasks.workspaceId, row.workspaceId) : isNull(tasks.workspaceId),
        ),
      )
      .limit(1);
    if (!task) return [];
    const subscriptions = await this.db
      .select({ userId: taskSubscriptions.userId })
      .from(taskSubscriptions)
      .where(
        and(
          eq(taskSubscriptions.taskId, task.id),
          isNull(taskSubscriptions.unsubscribedAt),
          row.workspaceId
            ? eq(taskSubscriptions.workspaceId, row.workspaceId)
            : isNull(taskSubscriptions.workspaceId),
        ),
      );
    const recipientKinds = new Map<string, 'comment' | 'completion' | 'mention'>();
    const completion = row.eventType.startsWith('task.run.');
    const commentId = asString(payload.commentId);
    const comment = commentId
      ? (
          await this.db
            .select()
            .from(taskComments)
            .where(and(eq(taskComments.id, commentId), eq(taskComments.taskId, task.id)))
            .limit(1)
        )[0]
      : undefined;
    if (!completion && !comment) return [];
    if (completion || row.eventType === 'task.comment.created') {
      for (const userId of [
        task.createdByUserId,
        task.assigneeUserId,
        ...subscriptions.map((item) => item.userId),
      ]) {
        if (userId) recipientKinds.set(userId, completion ? 'completion' : 'comment');
      }
    }
    // Only real member nodes in the persisted comment can upgrade a recipient to a mention.
    const previousMentions = new Set(
      row.eventType === 'task.comment.updated'
        ? extractMentionedUserIds(payload.previousEditorData)
        : [],
    );
    if (comment)
      for (const userId of extractMentionedUserIds(payload.editorData ?? comment.editorData)) {
        if (!previousMentions.has(userId)) recipientKinds.set(userId, 'mention');
      }
    const actorUserId = completion ? undefined : asString(payload.userId);
    if (actorUserId) recipientKinds.delete(actorUserId);
    const candidates = [...recipientKinds.keys()];
    if (candidates.length === 0) return [];
    const active = row.workspaceId
      ? new Set(
          (
            await this.db
              .select({ userId: workspaceMembers.userId })
              .from(workspaceMembers)
              .where(
                and(
                  eq(workspaceMembers.workspaceId, row.workspaceId),
                  inArray(workspaceMembers.userId, candidates),
                  isNull(workspaceMembers.deletedAt),
                  isNull(workspaceMembers.suspendedAt),
                ),
              )
          ).map((item) => item.userId),
        )
      : new Set(candidates);
    const metadata: NotificationMetadata = {};
    if (actorUserId) {
      const [actor] = await this.db.select().from(users).where(eq(users.id, actorUserId)).limit(1);
      if (actor)
        metadata.actor = {
          avatar: actor.avatar ?? undefined,
          name: actor.fullName || actor.username || undefined,
          userId: actor.id,
        };
    }
    if (completion && asString(payload.topicId)) {
      const [agent] = await this.db
        .select({
          avatar: agents.avatar,
          backgroundColor: agents.backgroundColor,
          id: agents.id,
          name: agents.title,
        })
        .from(taskTopics)
        .innerJoin(topics, eq(topics.id, taskTopics.topicId))
        .innerJoin(agents, eq(agents.id, topics.agentId))
        .where(and(eq(taskTopics.taskId, task.id), eq(taskTopics.topicId, String(payload.topicId))))
        .limit(1);
      if (agent)
        metadata.agent = {
          avatar: agent.avatar ?? undefined,
          backgroundColor: agent.backgroundColor ?? undefined,
          id: agent.id,
          name: agent.name ?? undefined,
        };
    }
    const targets: ProjectionTarget[] = [];
    for (const [userId, kind] of recipientKinds) {
      if (!active.has(userId)) continue;
      // TaskModel's shared predicate includes private-team and resource ACL.
      if (!(await new TaskModel(this.db, userId, row.workspaceId ?? undefined).findById(task.id)))
        continue;
      if (comment?.visibility === 'private' && comment.userId !== userId) continue;
      targets.push({
        content: completion
          ? row.eventType === 'task.run.completed'
            ? 'Agent finished this run'
            : 'Agent run failed'
          : (asString(payload.content) ?? comment!.content),
        episodeKey: completion
          ? `task:${task.id}:run:${String(payload.topicId)}:${String(payload.status)}`
          : `task:${task.id}:${kind}`,
        kind: 'update',
        metadata,
        recipientUserId: userId,
        resourceId: task.id,
        resourceType: 'task',
        title: task.name || task.instruction,
        type:
          kind === 'mention'
            ? 'mention'
            : completion
              ? row.eventType === 'task.run.completed'
                ? 'agent_run_completed'
                : 'agent_run_failed'
              : 'task_comment',
      });
    }
    return targets;
  };

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

    const targets =
      row.aggregateType === 'task' &&
      (row.eventType.startsWith('task.comment.') || row.eventType.startsWith('task.run.'))
        ? await this.resolveIssueTargets(row)
        : resolveNotificationTargets(row);
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
          metadata: target.metadata,
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
          metadata: target.metadata,
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
