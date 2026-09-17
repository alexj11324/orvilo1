// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { TaskDispatchModel } from '@/database/models/taskDispatch';
import {
  agents,
  projectAgents,
  projects,
  taskDispatches,
  tasks,
  users,
  workspaces,
} from '@/database/schemas';
import type { LobeChatDatabase } from '@/database/type';

import { TaskDispatchService, TaskDispatchWaitingError } from './index';

const db: LobeChatDatabase = await getTestDB();
const userId = 'task-dispatch-service-user';
const workspaceId = 'task-dispatch-service-workspace';

const cleanup = async () => {
  await db.delete(taskDispatches);
  await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
  await db.delete(projects).where(eq(projects.workspaceId, workspaceId));
  await db.delete(agents).where(eq(agents.workspaceId, workspaceId));
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
  const createPolicyProject = async (input: {
    autoDispatch: boolean;
    concurrencyLimit?: number;
  }) => {
    await db.insert(agents).values({ id: 'dispatch-policy-agent', userId, workspaceId });
    const [project] = await db
      .insert(projects)
      .values({
        coordinatorAgentId: 'dispatch-policy-agent',
        identifier: 'POL',
        name: 'Policy project',
        orchestrationPolicy: {
          autoDispatch: input.autoDispatch,
          concurrencyLimit: input.concurrencyLimit,
          executionBudget: { maxCost: 25, maxRuns: 10 },
          planningBudget: { maxRevisions: 20 },
          replanMode: 'apply',
          requireHumanReview: true,
        },
        userId,
        workspaceId,
      })
      .returning();
    await db.insert(projectAgents).values({
      addedByUserId: userId,
      agentId: 'dispatch-policy-agent',
      enabled: true,
      projectId: project.id,
      role: 'implementer',
      workspaceId,
    });
    return project;
  };

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

  it('claims the current Agent instead of the stale caller snapshot', async () => {
    await db.insert(agents).values([
      { id: 'dispatch-service-old', userId, workspaceId },
      { id: 'dispatch-service-new', userId, workspaceId },
    ]);
    const [staleTask] = await db
      .insert(tasks)
      .values({
        assigneeAgentId: 'dispatch-service-old',
        createdByUserId: userId,
        identifier: 'CURRENT-1',
        instruction: 'Use current assignment',
        seq: 4,
        workspaceId,
      })
      .returning();
    await db
      .update(tasks)
      .set({ assigneeAgentId: 'dispatch-service-new' })
      .where(eq(tasks.id, staleTask.id));

    const prepared = await new TaskDispatchService(db, workspaceId).prepare({
      idempotencyKey: 'manual:CURRENT-1:request-1',
      requestedBy: userId,
      task: staleTask,
      trigger: 'manual',
    });

    expect(prepared.dispatch.agentId).toBe('dispatch-service-new');
    expect(prepared.task.assigneeAgentId).toBe('dispatch-service-new');
  });

  it('parks orchestrator work while project auto-dispatch is disabled and resumes after policy changes', async () => {
    const project = await createPolicyProject({ autoDispatch: false });
    const [task] = await db
      .insert(tasks)
      .values({
        assigneeAgentId: 'dispatch-policy-agent',
        createdByUserId: userId,
        identifier: 'POL-1',
        instruction: 'Policy gated work',
        projectId: project.id,
        seq: 5,
        workspaceId,
      })
      .returning();
    const service = new TaskDispatchService(db, workspaceId);

    await expect(
      service.prepare({
        idempotencyKey: 'policy:POL-1:revision-1',
        requestedBy: 'planner',
        task,
        trigger: 'orchestrator',
      }),
    ).rejects.toMatchObject({
      dispatchId: expect.any(String),
      message: 'project_auto_dispatch_disabled',
    });
    expect((await db.select().from(taskDispatches))[0]).toMatchObject({
      phase: 'waiting',
      waitingReason: 'project_auto_dispatch_disabled',
    });

    await db
      .update(projects)
      .set({
        orchestrationPolicy: {
          ...project.orchestrationPolicy,
          autoDispatch: true,
        },
      })
      .where(eq(projects.id, project.id));
    await expect(
      service.prepare({
        idempotencyKey: 'policy:POL-1:revision-1',
        requestedBy: 'planner',
        task,
        trigger: 'orchestrator',
      }),
    ).resolves.toMatchObject({ dispatch: { phase: 'claimed' } });
  });

  it('serializes project auto-dispatch at the configured concurrency limit', async () => {
    const project = await createPolicyProject({ autoDispatch: true, concurrencyLimit: 1 });
    const [firstTask, secondTask] = await db
      .insert(tasks)
      .values([
        {
          assigneeAgentId: 'dispatch-policy-agent',
          createdByUserId: userId,
          identifier: 'POL-2',
          instruction: 'First policy run',
          projectId: project.id,
          seq: 6,
          workspaceId,
        },
        {
          assigneeAgentId: 'dispatch-policy-agent',
          createdByUserId: userId,
          identifier: 'POL-3',
          instruction: 'Second policy run',
          projectId: project.id,
          seq: 7,
          workspaceId,
        },
      ])
      .returning();
    const service = new TaskDispatchService(db, workspaceId);
    const first = await service.prepare({
      idempotencyKey: 'policy:POL-2:revision-1',
      requestedBy: 'planner',
      task: firstTask,
      trigger: 'orchestrator',
    });
    await expect(
      service.prepare({
        idempotencyKey: 'policy:POL-3:revision-1',
        requestedBy: 'planner',
        task: secondTask,
        trigger: 'orchestrator',
      }),
    ).rejects.toMatchObject({ message: 'project_concurrency_limit' });

    await new TaskDispatchModel(db, workspaceId).settle({
      dispatchId: first.dispatch.id,
      expected: ['claimed'],
      fence: first.fence,
      generation: first.dispatch.generation,
      phase: 'canceled',
    });
    await expect(
      service.prepare({
        idempotencyKey: 'policy:POL-3:revision-1',
        requestedBy: 'planner',
        task: secondTask,
        trigger: 'orchestrator',
      }),
    ).resolves.toMatchObject({ dispatch: { phase: 'claimed' } });
  });

  it('does not let parked policy work consume project concurrency', async () => {
    const project = await createPolicyProject({ autoDispatch: false, concurrencyLimit: 1 });
    const [firstTask, secondTask] = await db
      .insert(tasks)
      .values([
        {
          assigneeAgentId: 'dispatch-policy-agent',
          createdByUserId: userId,
          identifier: 'POL-4',
          instruction: 'First parked policy run',
          projectId: project.id,
          seq: 8,
          workspaceId,
        },
        {
          assigneeAgentId: 'dispatch-policy-agent',
          createdByUserId: userId,
          identifier: 'POL-5',
          instruction: 'Second parked policy run',
          projectId: project.id,
          seq: 9,
          workspaceId,
        },
      ])
      .returning();
    const service = new TaskDispatchService(db, workspaceId);

    for (const [task, key] of [
      [firstTask, 'policy:POL-4:revision-1'],
      [secondTask, 'policy:POL-5:revision-1'],
    ] as const) {
      await expect(
        service.prepare({
          idempotencyKey: key,
          requestedBy: 'planner',
          task,
          trigger: 'orchestrator',
        }),
      ).rejects.toMatchObject({ message: 'project_auto_dispatch_disabled' });
    }

    await db
      .update(projects)
      .set({ orchestrationPolicy: { ...project.orchestrationPolicy, autoDispatch: true } })
      .where(eq(projects.id, project.id));
    await expect(
      service.prepare({
        idempotencyKey: 'policy:POL-4:revision-1',
        requestedBy: 'planner',
        task: firstTask,
        trigger: 'orchestrator',
      }),
    ).resolves.toMatchObject({ dispatch: { phase: 'claimed' } });
  });

  it('rechecks project policy before resuming work that first waited for an Agent', async () => {
    const project = await createPolicyProject({ autoDispatch: true });
    const [task] = await db
      .insert(tasks)
      .values({
        createdByUserId: userId,
        identifier: 'POL-6',
        instruction: 'Assignment arrives after the policy changes',
        projectId: project.id,
        seq: 10,
        workspaceId,
      })
      .returning();
    const service = new TaskDispatchService(db, workspaceId);

    await expect(
      service.prepare({
        idempotencyKey: 'policy:POL-6:revision-1',
        requestedBy: 'planner',
        task,
        trigger: 'orchestrator',
      }),
    ).rejects.toMatchObject({ message: 'Task has no eligible execution Agent' });
    await db
      .update(projects)
      .set({ orchestrationPolicy: { ...project.orchestrationPolicy, autoDispatch: false } })
      .where(eq(projects.id, project.id));
    await db
      .update(tasks)
      .set({ assigneeAgentId: 'dispatch-policy-agent' })
      .where(eq(tasks.id, task.id));

    await expect(
      service.prepare({
        idempotencyKey: 'policy:POL-6:revision-1',
        requestedBy: 'planner',
        task,
        trigger: 'orchestrator',
      }),
    ).rejects.toMatchObject({ message: 'project_auto_dispatch_disabled' });
  });
});
