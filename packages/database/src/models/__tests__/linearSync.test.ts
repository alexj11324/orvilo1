// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  linearProjectBindings,
  linearSyncInbox,
  linearSyncOutbox,
  taskDomainEvents,
  taskPlanningScopes,
  users,
  workspaces,
} from '../../schemas';
import type { LobeChatDatabase } from '../../type';
import { LinearSyncModel } from '../linearSync';

const db: LobeChatDatabase = await getTestDB();
const userId = 'linear-sync-model-user';
const workspaceId = 'linear-sync-model-workspace';

const cleanup = async () => {
  await db.delete(linearSyncOutbox);
  await db.delete(linearSyncInbox);
  await db.delete(taskPlanningScopes);
  await db.delete(taskDomainEvents);
  await db.delete(linearProjectBindings);
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
};

beforeEach(async () => {
  await cleanup();
  await db.insert(users).values({ id: userId });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Linear Sync Test Workspace',
    primaryOwnerId: userId,
    slug: workspaceId,
  });
});

afterEach(cleanup);

describe('LinearSyncModel', () => {
  it('coalesces planning wakeups while keeping the first domain event idempotent', async () => {
    const model = new LinearSyncModel(db, workspaceId);
    const first = await model.recordDomainEvent({
      action: 'update',
      eventId: 'delivery-1',
      idempotencyKey: 'linear:delivery-1',
      payload: { issueId: 'issue-1' },
      projectId: null,
      source: 'linear',
      taskId: null,
      type: 'linear.issue.changed',
    });
    const duplicate = await model.recordDomainEvent({
      action: 'update',
      eventId: 'delivery-1',
      idempotencyKey: 'linear:delivery-1',
      payload: { issueId: 'issue-1', changedAgain: true },
      projectId: null,
      source: 'linear',
      taskId: null,
      type: 'linear.issue.changed',
    });

    expect(duplicate.event.id).toBe(first.event.id);
    expect(duplicate.event.revision).toBe(first.event.revision);
    expect(duplicate.scope?.dirtyRevision).toBe(first.event.revision);

    const events = await db.select().from(taskDomainEvents);
    const scopes = await db.select().from(taskPlanningScopes);
    expect(events).toHaveLength(1);
    expect(scopes).toMatchObject([
      {
        dirtyRevision: first.event.revision,
        scopeId: workspaceId,
        scopeType: 'workspace',
        status: 'queued',
      },
    ]);
  });
});
