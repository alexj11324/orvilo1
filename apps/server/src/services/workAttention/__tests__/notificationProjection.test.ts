import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EventConsumerReceiptModel } from '@/database/models/eventConsumerReceipt';
import { NotificationModel } from '@/database/models/notification';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import {
  agents,
  eventOutbox,
  notifications,
  taskComments,
  tasks,
  taskTopics,
  teams,
  teamWorkflowStates,
  topics,
  users,
  userSettings,
  workspaceMembers,
  workspaces,
  workspaceUserSettings,
} from '@/database/schemas';
import type { EventOutboxItem } from '@/database/schemas/eventOutbox';
import { eventConsumerReceipts, taskSubscriptions } from '@/database/schemas/workAttention';

import {
  NotificationProjectionService,
  resolveNotificationTargets,
} from '../notificationProjection';

const event = (overrides: Partial<EventOutboxItem> = {}): EventOutboxItem =>
  ({
    aggregateId: 'ws1',
    aggregateType: 'workspace',
    attempts: 0,
    createdAt: new Date('2026-09-18T00:00:00Z'),
    deliveredAt: null,
    eventId: 'evt-1',
    eventType: 'workspace.ownership_transfer.requested',
    id: 'out-1',
    nextAttemptAt: null,
    payload: {},
    status: 'pending',
    workspaceId: 'ws1',
    ...overrides,
  }) as EventOutboxItem;

describe('resolveNotificationTargets', () => {
  it('projects an ownership-transfer request to the invited member as an action card', () => {
    const targets = resolveNotificationTargets(
      event({
        payload: { toUserId: 'admin-1', transferId: 'tr_1' },
      }),
    );

    expect(targets).toEqual([
      expect.objectContaining({
        actionKind: 'workspace_ownership_transfer',
        actionRequestId: 'tr_1',
        kind: 'action',
        recipientUserId: 'admin-1',
        type: 'workspace_ownership_transfer',
      }),
    ]);
  });

  it('does not classify ownership-transfer events as resource_transfer', () => {
    const targets = resolveNotificationTargets(
      event({
        payload: {
          recipientId: 'someone-else',
          requestId: 'rtr_1',
          toUserId: 'admin-1',
          transferId: 'tr_1',
        },
      }),
    );

    expect(targets).toHaveLength(1);
    expect(targets[0]?.actionKind).toBe('workspace_ownership_transfer');
    expect(targets[0]?.actionRequestId).toBe('tr_1');
  });

  it('keeps agent/group resource transfers on the original action source', () => {
    const targets = resolveNotificationTargets(
      event({
        aggregateId: 'agent_1',
        aggregateType: 'agent',
        eventType: 'agent.transfer.requested',
        payload: { recipientId: 'u-2', requestId: 'rtr_9' },
      }),
    );

    expect(targets).toEqual([
      expect.objectContaining({
        actionKind: 'resource_transfer',
        actionRequestId: 'rtr_9',
        recipientUserId: 'u-2',
      }),
    ]);
  });
});

const db = await getTestDB();
describe('real Issue notification producers and projection', () => {
  const wsId = 'notification-projection-workspace';
  const owner = 'projection-owner';
  const author = 'projection-author';
  const subscriber = 'projection-subscriber';
  const mentioned = 'projection-mentioned';
  const outsider = 'projection-outsider';

  beforeEach(async () => {
    await db.delete(eventConsumerReceipts);
    await db.delete(eventOutbox);
    await db.delete(users);
    await db
      .insert(users)
      .values([owner, author, subscriber, mentioned, outsider].map((id) => ({ id })));
    await db.insert(workspaces).values({
      id: wsId,
      name: 'Notification projection',
      primaryOwnerId: owner,
      slug: 'notification-projection',
    });
    await db
      .insert(workspaceMembers)
      .values(
        [owner, author, subscriber, mentioned].map((userId) => ({ userId, workspaceId: wsId })),
      );
    await db.insert(tasks).values({
      assigneeUserId: author,
      createdByUserId: owner,
      id: 'projection-issue',
      identifier: 'T-1',
      instruction: 'Work',
      name: 'Original Issue',
      seq: 1,
      workspaceId: wsId,
    });
    await db
      .insert(taskSubscriptions)
      .values({ taskId: 'projection-issue', userId: subscriber, workspaceId: wsId });
  });
  afterEach(async () => {
    await db.delete(eventConsumerReceipts);
    await db.delete(eventOutbox);
    await db.delete(users);
  });

  const project = async () => {
    const rows = await db.select().from(eventOutbox);
    for (const row of rows)
      await new EventConsumerReceiptModel(db).fanOut(db, {
        eventId: row.eventId,
        outboxId: row.id,
      });
    await new NotificationProjectionService(db).drainPending();
  };
  const feed = (userId: string) =>
    new NotificationModel(db, userId, { workspaceId: wsId }).listFeed();

  it('honors personal event switches inside a workspace and preserves other recipients', async () => {
    await db.insert(userSettings).values({
      id: subscriber,
      notification: { inbox: { items: { work: { task_status_changed: false } } } },
    });
    await db.insert(workspaceUserSettings).values({
      workspaceId: wsId,
      userId: author,
      preference: { notification: { inbox: { enabled: false } } },
    });
    await db
      .update(tasks)
      .set({ workflowCategory: 'in_review', reviewerUserId: author })
      .where(eq(tasks.id, 'projection-issue'));
    await db.insert(eventOutbox).values({
      aggregateId: 'projection-issue',
      aggregateType: 'task',
      eventId: 'state-changed',
      eventType: 'task.status.changed',
      workspaceId: wsId,
      payload: { userId: owner },
    });
    await project();
    expect(await feed(subscriber)).toHaveLength(0);
    expect(await feed(owner)).toHaveLength(0);
    expect(await feed(author)).toEqual([expect.objectContaining({ type: 'task_review' })]);
    await project();
    expect(await feed(author)).toHaveLength(1);
  });

  it('honors an inbox channel opt-out for assignment and keeps unauthorized users out', async () => {
    await db.insert(userSettings).values({
      id: author,
      notification: { inbox: { enabled: false } },
    });
    await db.insert(eventOutbox).values({
      aggregateId: 'projection-issue',
      aggregateType: 'task',
      eventId: 'assigned',
      eventType: 'task.assigned',
      workspaceId: wsId,
      payload: { userId: owner, assigneeUserId: outsider },
    });
    await project();
    expect(await feed(author)).toHaveLength(0);
    expect(await feed(outsider)).toHaveLength(0);
  });

  it.each([{ workflowCategory: 'in_progress' as const }, { assigneeUserId: owner }])(
    'excludes a human actor through updateWithLog: %j',
    async (patch) => {
      await new TaskModel(db, owner, wsId).updateWithLog('projection-issue', patch, {
        userId: owner,
      });
      const rows = await db.select().from(eventOutbox);
      expect(rows).not.toHaveLength(0);
      expect(rows[0].payload).toMatchObject({ userId: owner });
      await project();
      expect(await feed(owner)).toHaveLength(0);
      if ('workflowCategory' in patch) expect(await feed(subscriber)).toHaveLength(1);
    },
  );

  it('does not attribute an Agent edit to its human session owner', async () => {
    await db.insert(agents).values({ id: 'editing-agent', userId: owner });
    await new TaskModel(db, owner, wsId).updateWithLog(
      'projection-issue',
      { workflowCategory: 'in_progress' },
      { agentId: 'editing-agent', userId: owner },
    );
    const [row] = await db.select().from(eventOutbox);
    expect(row.payload).not.toHaveProperty('userId');
    await project();
    expect(await feed(owner)).toHaveLength(1);
  });

  it.each([
    ['backlog', 'Backlog'],
    ['todo', 'Todo'],
    ['in_progress', 'In Progress'],
    ['in_review', 'In Review'],
    ['done', 'Done'],
    ['canceled', 'Canceled'],
    ['triage', 'Triage'],
  ] as const)('uses a readable fallback for %s', async (category, label) => {
    await db
      .update(tasks)
      .set({ workflowCategory: category })
      .where(eq(tasks.id, 'projection-issue'));
    await db.insert(eventOutbox).values({
      aggregateId: 'projection-issue',
      aggregateType: 'task',
      eventId: 'status-label',
      eventType: 'task.status.changed',
      workspaceId: wsId,
      payload: { userId: author },
    });
    await project();
    expect(await feed(owner)).toEqual([
      expect.objectContaining({ content: `Issue status changed to ${label}` }),
    ]);
  });

  it('uses a custom workflow state name instead of its category', async () => {
    await db
      .insert(teams)
      .values({ id: 'status-team', key: 'STATE', name: 'States', workspaceId: wsId });
    const [state] = await db
      .insert(teamWorkflowStates)
      .values({
        teamId: 'status-team',
        workspaceId: wsId,
        category: 'in_progress',
        name: 'Quality assurance',
      })
      .returning();
    await db
      .update(tasks)
      .set({
        teamId: 'status-team',
        workflowStateRefId: state.id,
        workflowCategory: state.category,
      })
      .where(eq(tasks.id, 'projection-issue'));
    await db.insert(eventOutbox).values({
      aggregateId: 'projection-issue',
      aggregateType: 'task',
      eventId: 'custom-status',
      eventType: 'task.status.changed',
      workspaceId: wsId,
      payload: { userId: author },
    });
    await project();
    expect(await feed(owner)).toEqual([
      expect.objectContaining({ content: 'Issue status changed to Quality assurance' }),
    ]);
  });

  it('notifies creator, subscriber and authorized mentions once, excludes the actor and arbitrary mention ids', async () => {
    const comment = await new TaskModel(db, author, wsId).addComment({
      authorUserId: author,
      content: 'Please review this',
      editorData: {
        root: {
          children: [mentioned, outsider, author].map((id) => ({
            metadata: { id, type: 'member' },
            type: 'mention',
          })),
        },
      },
      taskId: 'projection-issue',
      userId: author,
    });
    const [produced] = await db.select().from(eventOutbox);
    expect(produced).toMatchObject({
      aggregateId: 'projection-issue',
      payload: { commentId: comment.id },
      workspaceId: wsId,
    });
    await project();
    await project();
    expect(await feed(owner)).toHaveLength(1);
    expect(await feed(subscriber)).toHaveLength(1);
    expect(await feed(mentioned)).toMatchObject([
      { resourceId: 'projection-issue', type: 'mention' },
    ]);
    expect(await feed(author)).toEqual([]);
    expect(await feed(outsider)).toEqual([]);
  });

  it('projects manual and scheduled Agent completion without excluding its human owner or changing Issue status', async () => {
    await db
      .insert(agents)
      .values({ id: 'projection-agent', title: 'Codex', userId: owner, workspaceId: wsId });
    for (const [index, trigger] of ['manual', 'schedule'].entries()) {
      const topicId = `projection-topic-${index}`;
      await db
        .insert(topics)
        .values({ agentId: 'projection-agent', id: topicId, userId: owner, workspaceId: wsId });
      await db.insert(taskTopics).values({
        operationId: `projection-op-${index}`,
        seq: index + 1,
        taskId: 'projection-issue',
        topicId,
        trigger: trigger as 'manual' | 'schedule',
        userId: owner,
        workspaceId: wsId,
      });
      const model = new TaskTopicModel(db, owner, wsId);
      await model.updateStatus('projection-issue', topicId, 'completed');
      await model.updateStatus('projection-issue', topicId, 'completed');
    }
    expect(await db.select().from(eventOutbox)).toHaveLength(2);
    await project();
    expect(await feed(owner)).toHaveLength(2);
    expect(await feed(subscriber)).toHaveLength(2);
    expect(await feed(author)).toHaveLength(2);
    expect((await feed(owner))[0]).toMatchObject({
      metadata: { agent: { id: 'projection-agent', name: 'Codex' } },
      resourceId: 'projection-issue',
      type: 'agent_run_completed',
    });
    expect(
      (await db.select().from(tasks).where(eq(tasks.id, 'projection-issue')))[0].workflowCategory,
    ).toBe('backlog');
  });

  it('only notifies newly added mentions on edits and keeps a deleted comment out of Inbox', async () => {
    const model = new TaskModel(db, author, wsId);
    const editorData = (ids: string[]) => ({
      root: { children: ids.map((id) => ({ metadata: { id, type: 'member' }, type: 'mention' })) },
    });
    const comment = await model.addComment({
      authorUserId: author,
      content: 'First note',
      editorData: editorData([mentioned]),
      taskId: 'projection-issue',
      userId: author,
    });
    await model.updateComment(comment.id, 'Updated note', {
      editorData: editorData([mentioned, subscriber]),
    });
    await project();
    expect(await feed(mentioned)).toMatchObject([
      { activityVersion: 1, content: 'First note', type: 'mention' },
    ]);
    expect((await feed(subscriber)).map((row) => row.type).sort()).toEqual([
      'mention',
      'task_comment',
    ]);
    expect(await feed(owner)).toMatchObject([{ activityVersion: 1 }]);
    const removed = await model.addComment({
      authorUserId: author,
      content: 'Removed before projection',
      taskId: 'projection-issue',
      userId: author,
    });
    await model.deleteComment(removed.id);
    await project();
    expect(await feed(owner)).toMatchObject([{ activityVersion: 1 }]);
  });

  it('drops inactive and unsubscribed recipients while sharing Issue dialogue across private Teams', async () => {
    await db
      .update(workspaceMembers)
      .set({ suspendedAt: new Date() })
      .where(eq(workspaceMembers.userId, mentioned));
    await db
      .update(taskSubscriptions)
      .set({ unsubscribedAt: new Date() })
      .where(eq(taskSubscriptions.userId, subscriber));
    const model = new TaskModel(db, author, wsId);
    await model.addComment({
      authorUserId: author,
      content: 'Public note',
      editorData: {
        root: { children: [{ metadata: { id: mentioned, type: 'member' }, type: 'mention' }] },
      },
      taskId: 'projection-issue',
      userId: author,
    });
    await project();
    expect(await feed(owner)).toHaveLength(1);
    expect(await feed(mentioned)).toEqual([]);
    expect(await feed(subscriber)).toEqual([]);
    // Active workspace members can read Issue dialogue without private Team membership.
    await db.insert(teams).values({
      id: 'projection-private-team',
      key: 'PRV',
      name: 'Private team',
      visibility: 'private',
      workspaceId: wsId,
    });
    await db
      .update(tasks)
      .set({ teamId: 'projection-private-team' })
      .where(eq(tasks.id, 'projection-issue'));
    await db
      .update(taskSubscriptions)
      .set({ unsubscribedAt: null })
      .where(eq(taskSubscriptions.userId, subscriber));
    await new TaskModel(db, owner, wsId).addComment({
      authorUserId: owner,
      content: 'Shared note in a private Team',
      editorData: {
        root: {
          children: [subscriber, mentioned, outsider].map((id) => ({
            metadata: { id, type: 'member' },
            type: 'mention',
          })),
        },
      },
      taskId: 'projection-issue',
      userId: owner,
    });
    await project();
    expect(await feed(subscriber)).toMatchObject([
      { content: 'Shared note in a private Team', type: 'mention' },
    ]);
    for (const userId of [mentioned, outsider]) {
      expect(await feed(userId)).toEqual([]);
      // Denied recipients must be filtered before persistence, as well as at feed read.
      expect(await db.select().from(notifications).where(eq(notifications.userId, userId))).toEqual(
        [],
      );
    }
  });

  it('does not project a persisted private comment to other readable Issue members', async () => {
    const comment = await new TaskModel(db, author, wsId).addComment({
      authorUserId: author,
      content: 'Private comment body',
      editorData: {
        root: { children: [{ metadata: { id: mentioned, type: 'member' }, type: 'mention' }] },
      },
      taskId: 'projection-issue',
      userId: author,
    });
    // Retain the separate read boundary of an existing private comment row.
    await db
      .update(taskComments)
      .set({ visibility: 'private' })
      .where(eq(taskComments.id, comment.id));
    await project();
    for (const userId of [owner, subscriber, mentioned]) {
      expect(await feed(userId)).toEqual([]);
      expect(await db.select().from(notifications).where(eq(notifications.userId, userId))).toEqual(
        [],
      );
    }
  });
});
