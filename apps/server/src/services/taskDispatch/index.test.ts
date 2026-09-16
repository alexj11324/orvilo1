// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { taskDispatches, tasks, users, workspaces } from '@/database/schemas';
import type { LobeChatDatabase } from '@/database/type';

import { TaskDispatchService, TaskDispatchWaitingError } from './index';

const db: LobeChatDatabase = await getTestDB();
const userId = 'task-dispatch-service-user';
const workspaceId = 'task-dispatch-service-workspace';

const cleanup = async () => {
  await db.delete(taskDispatches);
  await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
};

beforeEach(async () => {
  await cleanup();
  await db.insert(users).values({ id: userId });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Task Dispatch Service Workspace',
    primaryOwnerId: userId,
    slug: workspaceId,
  });
});

afterEach(cleanup);

describe('TaskDispatchService', () => {
  it('parks an unassigned integration task instead of using a personal inbox Agent', async () => {
    const [task] = await db
      .insert(tasks)
      .values({
        assignmentMode: 'orchestrated',
        createdBySubjectId: 'linear-installation-1',
        createdBySubjectKind: 'integration',
        identifier: 'LIN-1',
        instruction: 'Imported work',
        orchestrationOwner: 'project:project-1',
        seq: 1,
        workspaceId,
      })
      .returning();

    const service = new TaskDispatchService(db, workspaceId);
    await expect(
      service.prepare({
        idempotencyKey: 'linear:auto:LIN-1',
        requestedBy: 'linear-installation-1',
        task,
        trigger: 'orchestrator',
      }),
    ).rejects.toBeInstanceOf(TaskDispatchWaitingError);

    const [dispatch] = await db.select().from(taskDispatches);
    expect(dispatch).toMatchObject({ phase: 'waiting', waitingReason: 'no_eligible_agent' });
  });

  it('parks an unattended schedule tick without an Agent', async () => {
    const [task] = await db
      .insert(tasks)
      .values({
        createdByUserId: userId,
        identifier: 'SCH-1',
        instruction: 'Scheduled work',
        seq: 2,
        workspaceId,
      })
      .returning();

    const service = new TaskDispatchService(db, workspaceId);
    await expect(
      service.prepare({
        idempotencyKey: 'schedule:SCH-1:2026-09-16T16:00:00Z',
        requestedBy: userId,
        task,
        trigger: 'schedule',
      }),
    ).rejects.toBeInstanceOf(TaskDispatchWaitingError);
  });

  it('keeps the explicit manual compatibility fallback claimable', async () => {
    const [task] = await db
      .insert(tasks)
      .values({
        createdByUserId: userId,
        identifier: 'MAN-1',
        instruction: 'Manual work',
        seq: 3,
        workspaceId,
      })
      .returning();

    const service = new TaskDispatchService(db, workspaceId);
    const prepared = await service.prepare({
      idempotencyKey: 'manual:MAN-1:request-1',
      requestedBy: userId,
      task,
      trigger: 'manual',
    });

    expect(prepared.dispatch).toMatchObject({ generation: 1, phase: 'claimed' });
    expect(prepared.fence).toBe(1);
  });
});
