// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { TaskDispatchModel } from '@/database/models/taskDispatch';
import {
  agents,
  projectAgents,
  projects,
  taskDispatches,
  tasks,
  taskTopics,
  topics,
  users,
  workspaces,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';

import { TaskDispatchService, TaskDispatchWaitingError } from './index';

vi.mock('@/server/featureFlags/caidAdmission', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...(actual as Record<string, unknown>), isCaidDispatchAllowed: vi.fn(async () => true) };
});

const { isCaidDispatchAllowed } = await import('@/server/featureFlags/caidAdmission');

const db: OrviloDatabase = await getTestDB();
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
  vi.mocked(isCaidDispatchAllowed).mockResolvedValue(true);
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
    executionBudget?: { maxCost: number; maxRuns: number };
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
          executionBudget: input.executionBudget ?? { maxCost: 25, maxRuns: 10 },
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
        origin: 'caid',
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
        origin: 'external',
        trigger: 'schedule',
      }),
    ).rejects.toBeInstanceOf(TaskDispatchWaitingError);
  });

  it('allows an explicit manual task to resolve the personal inbox Agent at runtime', async () => {
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
    await expect(
      service.prepare({
        idempotencyKey: 'manual:MAN-1:request-1',
        requestedBy: userId,
        task,
        origin: 'external',
        trigger: 'manual',
      }),
    ).resolves.toMatchObject({ dispatch: { agentId: null, phase: 'claimed' } });
    await expect(db.select().from(taskDispatches)).resolves.toMatchObject([
      { agentId: null, phase: 'claimed', waitingReason: null },
    ]);
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
      origin: 'external',
      trigger: 'manual',
    });

    expect(prepared.dispatch.agentId).toBe('dispatch-service-new');
    expect(prepared.task.assigneeAgentId).toBe('dispatch-service-new');
  });

  it('claims the original waiting dispatch when a repaired task is retried with a new key', async () => {
    const [task] = await db
      .insert(tasks)
      .values({
        assignmentMode: 'orchestrated',
        createdByUserId: userId,
        identifier: 'REPAIR-1',
        instruction: 'Resume after assignment repair',
        orchestrationOwner: 'project:repair-project',
        seq: 5,
        workspaceId,
      })
      .returning();
    const service = new TaskDispatchService(db, workspaceId);
    await expect(
      service.prepare({
        idempotencyKey: 'orchestrator:REPAIR-1:plan-1',
        requestedBy: 'planning:first',
        task,
        origin: 'caid',
        trigger: 'orchestrator',
      }),
    ).rejects.toBeInstanceOf(TaskDispatchWaitingError);
    const [waiting] = await db
      .select()
      .from(taskDispatches)
      .where(eq(taskDispatches.taskId, task.id));
    await db.insert(agents).values({ id: 'repair-agent', userId, workspaceId });
    const [repaired] = await db
      .update(tasks)
      .set({ assigneeAgentId: 'repair-agent' })
      .where(eq(tasks.id, task.id))
      .returning();

    await expect(
      service.prepare({
        idempotencyKey: 'orchestrator:REPAIR-1:plan-2',
        requestedBy: 'planning:second',
        task: repaired,
        origin: 'caid',
        trigger: 'orchestrator',
      }),
    ).resolves.toMatchObject({
      dispatch: {
        agentId: 'repair-agent',
        id: waiting.id,
        idempotencyKey: 'orchestrator:REPAIR-1:plan-1',
        phase: 'claimed',
      },
    });
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
        origin: 'caid',
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
        origin: 'caid',
        trigger: 'orchestrator',
      }),
    ).resolves.toMatchObject({ dispatch: { phase: 'claimed' } });
  });

  it('cancels an automated dispatch when project policy closes during provisioning', async () => {
    const project = await createPolicyProject({ autoDispatch: true });
    const [task] = await db
      .insert(tasks)
      .values({
        assigneeAgentId: 'dispatch-policy-agent',
        createdByUserId: userId,
        identifier: 'POL-1B',
        instruction: 'Policy changes while the workspace is provisioning',
        projectId: project.id,
        seq: 51,
        workspaceId,
      })
      .returning();
    const service = new TaskDispatchService(db, workspaceId);
    const prepared = await service.prepare({
      idempotencyKey: 'policy:POL-1B:revision-1',
      requestedBy: 'planner',
      task,
      origin: 'caid',
      trigger: 'orchestrator',
    });
    await service.transition(prepared, { expected: ['claimed'], phase: 'provisioning' });

    await db
      .update(projects)
      .set({ orchestrationPolicy: { ...project.orchestrationPolicy, autoDispatch: false } })
      .where(eq(projects.id, project.id));

    await expect(
      service.transition(prepared, { expected: ['provisioning'], phase: 'dispatched' }),
    ).rejects.toMatchObject({ dispatchId: prepared.dispatch.id });
    await expect(
      db.select().from(taskDispatches).where(eq(taskDispatches.id, prepared.dispatch.id)),
    ).resolves.toMatchObject([
      expect.objectContaining({
        phase: 'canceled',
        waitingReason: 'project_auto_dispatch_disabled',
      }),
    ]);
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
      origin: 'caid',
      trigger: 'orchestrator',
    });
    await expect(
      service.prepare({
        idempotencyKey: 'policy:POL-3:revision-1',
        requestedBy: 'planner',
        task: secondTask,
        origin: 'caid',
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
        origin: 'caid',
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
          origin: 'caid',
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
        origin: 'caid',
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
        origin: 'caid',
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
        origin: 'caid',
        trigger: 'orchestrator',
      }),
    ).rejects.toMatchObject({ message: 'project_auto_dispatch_disabled' });
  });

  it.each([
    {
      budget: { maxCost: 100, maxRuns: 1 },
      expectedReason: 'project_run_budget_exhausted',
      totalCost: '1',
    },
    {
      budget: { maxCost: 25, maxRuns: 10 },
      expectedReason: 'project_cost_budget_exhausted',
      totalCost: '25',
    },
  ])(
    'parks orchestrator work when $expectedReason',
    async ({ budget, expectedReason, totalCost }) => {
      const project = await createPolicyProject({ autoDispatch: true, executionBudget: budget });
      const [completedTask, nextTask] = await db
        .insert(tasks)
        .values([
          {
            assigneeAgentId: 'dispatch-policy-agent',
            createdByUserId: userId,
            identifier: 'POL-7',
            instruction: 'Completed policy run',
            projectId: project.id,
            seq: 11,
            workspaceId,
          },
          {
            assigneeAgentId: 'dispatch-policy-agent',
            createdByUserId: userId,
            identifier: 'POL-8',
            instruction: 'Next policy run',
            projectId: project.id,
            seq: 12,
            workspaceId,
          },
        ])
        .returning();
      const [topic] = await db
        .insert(topics)
        .values({ totalCost: Number(totalCost), userId, workspaceId })
        .returning();
      await db.insert(taskTopics).values({
        seq: 1,
        status: 'completed',
        taskId: completedTask.id,
        topicId: topic.id,
        userId,
        workspaceId,
      });

      await expect(
        new TaskDispatchService(db, workspaceId).prepare({
          idempotencyKey: `policy:${nextTask.identifier}:revision-1`,
          requestedBy: 'planner',
          task: nextTask,
          origin: 'caid',
          trigger: 'orchestrator',
        }),
      ).rejects.toMatchObject({ message: expectedReason });
    },
  );

  it.each(['schedule', 'heartbeat'] as const)(
    'applies project execution budgets to %s runs',
    async (trigger) => {
      const project = await createPolicyProject({
        autoDispatch: true,
        executionBudget: { maxCost: 100, maxRuns: 1 },
      });
      const [completedTask, nextTask] = await db
        .insert(tasks)
        .values([
          {
            assigneeAgentId: 'dispatch-policy-agent',
            createdByUserId: userId,
            identifier: `AUTO-${trigger}-1`,
            instruction: 'Completed automatic run',
            projectId: project.id,
            seq: trigger === 'schedule' ? 13 : 15,
            workspaceId,
          },
          {
            assigneeAgentId: 'dispatch-policy-agent',
            createdByUserId: userId,
            identifier: `AUTO-${trigger}-2`,
            instruction: 'Next automatic run',
            projectId: project.id,
            seq: trigger === 'schedule' ? 14 : 16,
            workspaceId,
          },
        ])
        .returning();
      const [topic] = await db.insert(topics).values({ userId, workspaceId }).returning();
      await db.insert(taskTopics).values({
        seq: 1,
        status: 'completed',
        taskId: completedTask.id,
        topicId: topic.id,
        trigger,
        userId,
        workspaceId,
      });

      await expect(
        new TaskDispatchService(db, workspaceId).prepare({
          idempotencyKey: `${trigger}:${nextTask.id}:tick-1`,
          origin: 'external',
          requestedBy: 'scheduler',
          task: nextTask,
          trigger,
        }),
      ).rejects.toMatchObject({ message: 'project_run_budget_exhausted' });
    },
  );

  describe('CAID admission at the claim boundary (F12/J01–J02)', () => {
    const seedAssignedTask = async (identifier: string) => {
      await db.insert(agents).values({ id: `agent-${identifier}`, userId, workspaceId });
      const [task] = await db
        .insert(tasks)
        .values({
          assigneeAgentId: `agent-${identifier}`,
          createdByUserId: userId,
          identifier,
          instruction: 'Orchestrated follow-on',
          seq: 20,
          workspaceId,
        })
        .returning();
      return task;
    };

    it('J02 — holds a new CAID claim when admission is off at the final boundary', async () => {
      vi.mocked(isCaidDispatchAllowed).mockResolvedValue(false);
      const task = await seedAssignedTask('CAID-HOLD-1');

      await expect(
        new TaskDispatchService(db, workspaceId).prepare({
          idempotencyKey: 'orchestrator:CAID-HOLD-1:cascade-1',
          origin: 'caid',
          requestedBy: userId,
          task,
          trigger: 'orchestrator',
        }),
      ).rejects.toBeInstanceOf(TaskDispatchWaitingError);

      const [dispatch] = await db.select().from(taskDispatches);
      expect(dispatch).toMatchObject({
        phase: 'waiting',
        waitingReason: 'caid_dispatch_disabled',
      });
    });

    it('J01 — a manual/external claim is unaffected while CAID admission is off', async () => {
      vi.mocked(isCaidDispatchAllowed).mockResolvedValue(false);
      const task = await seedAssignedTask('MANUAL-1');

      const prepared = await new TaskDispatchService(db, workspaceId).prepare({
        idempotencyKey: 'manual:MANUAL-1:request-1',
        origin: 'external',
        requestedBy: userId,
        task,
        trigger: 'manual',
      });
      expect(prepared.dispatch.phase).toBe('claimed');
      expect(isCaidDispatchAllowed).not.toHaveBeenCalled();
    });

    it('J02 — a held dispatch re-parks while off and resumes once admission turns on', async () => {
      const task = await seedAssignedTask('CAID-RESUME-1');
      const service = new TaskDispatchService(db, workspaceId);

      vi.mocked(isCaidDispatchAllowed).mockResolvedValue(false);
      await expect(
        service.prepare({
          idempotencyKey: 'orchestrator:CAID-RESUME-1:cascade-1',
          origin: 'caid',
          requestedBy: userId,
          task,
          trigger: 'orchestrator',
        }),
      ).rejects.toBeInstanceOf(TaskDispatchWaitingError);

      // Still off: the replayed wake claims the waiting row, then the boundary
      // re-parks it instead of letting a new writer through.
      await expect(
        service.prepare({
          idempotencyKey: 'orchestrator:CAID-RESUME-1:cascade-2',
          origin: 'caid',
          requestedBy: userId,
          task,
          trigger: 'orchestrator',
        }),
      ).rejects.toBeInstanceOf(TaskDispatchWaitingError);
      const [held] = await db.select().from(taskDispatches);
      expect(held).toMatchObject({ phase: 'waiting', waitingReason: 'caid_dispatch_disabled' });

      // On: the same task's next wake resumes into a claimed dispatch.
      vi.mocked(isCaidDispatchAllowed).mockResolvedValue(true);
      const prepared = await service.prepare({
        idempotencyKey: 'orchestrator:CAID-RESUME-1:cascade-3',
        origin: 'caid',
        requestedBy: userId,
        task,
        trigger: 'orchestrator',
      });
      expect(prepared.dispatch.phase).toBe('claimed');
    });

    it('SA05-B — a flag flip after prepare parks the claim at the dispatched boundary', async () => {
      const task = await seedAssignedTask('CAID-FLIP-1');
      const service = new TaskDispatchService(db, workspaceId);

      // Prepare allowed while the flag was on; rollout flips before the host
      // admits the writer.
      const prepared = await service.prepare({
        idempotencyKey: 'orchestrator:CAID-FLIP-1:cascade-1',
        origin: 'caid',
        requestedBy: userId,
        task,
        trigger: 'orchestrator',
      });
      expect(prepared.dispatch.phase).toBe('claimed');
      await service.transition(prepared, { expected: ['claimed'], phase: 'provisioning' });
      vi.mocked(isCaidDispatchAllowed).mockResolvedValue(false);

      await expect(
        service.transition(prepared, { expected: ['provisioning'], phase: 'dispatched' }),
      ).rejects.toBeInstanceOf(TaskDispatchWaitingError);

      const [held] = await db.select().from(taskDispatches);
      expect(held).toMatchObject({
        leaseOwner: null,
        origin: 'caid',
        phase: 'waiting',
        waitingReason: 'caid_dispatch_disabled',
      });
      // No writer was produced: the dispatch never reached 'dispatched'/'running'.
      expect(held.operationId).toBeNull();
    });

    /**
     * A settled source dispatch: the delivery chain a settlement grant binds
     * to. `executionGeneration` is advanced to the source's generation so the
     * task stands on that delivery.
     */
    const seedSettledSourceDispatch = async (taskId: string, generation: number) => {
      const dispatchId = `dsp-src-${taskId}-${generation}`;
      await db.insert(taskDispatches).values({
        generation,
        id: dispatchId,
        idempotencyKey: `src:${taskId}:${generation}`,
        phase: 'succeeded',
        policyRevision: 0,
        requestedBy: `manual:${userId}`,
        requirementRevision: 0,
        taskId,
        taskRevision: 0,
        workspaceId,
      });
      await db.update(tasks).set({ executionGeneration: generation }).where(eq(tasks.id, taskId));
      return dispatchId;
    };

    const boundGrant = (sourceDispatchId: string, sourceGeneration: number) => ({
      allowedIntents: ['repair' as const],
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      kind: 'integration_seed' as const,
      sourceDispatchId,
      sourceGeneration,
      sourceTopicId: 'tpc_src',
      workspaceId,
    });

    it('SA05-B — a verified internal settlement completes while admission is off', async () => {
      vi.mocked(isCaidDispatchAllowed).mockResolvedValue(false);
      const task = await seedAssignedTask('CAID-SETTLE-1');
      const sourceDispatchId = await seedSettledSourceDispatch(task.id, 1);
      const service = new TaskDispatchService(db, workspaceId);

      const prepared = await service.prepare({
        idempotencyKey: 'orchestrator:CAID-SETTLE-1:settle-1',
        initiator: 'planner-actor',
        origin: 'internal',
        requestedBy: 'planner',
        settlementGrant: boundGrant(sourceDispatchId, 1),
        sourceDispatchId,
        task,
        trigger: 'orchestrator',
      });
      // Settlement work is evidence-verified upstream — the CAID rollout flag
      // does not gate it, and the row records its provenance.
      expect(prepared.dispatch).toMatchObject({
        initiator: 'planner-actor',
        origin: 'internal',
        phase: 'claimed',
        settlementGrant: {
          ...boundGrant(sourceDispatchId, 1),
          // Minted at persist time — assert the TTL window rather than the ms.
          expiresAt: expect.any(String),
        },
      });
      const grant = prepared.dispatch.settlementGrant!;
      expect(Date.parse(grant.expiresAt as string) - Date.now()).toBeGreaterThan(29 * 60 * 1000);
      expect(Date.parse(grant.expiresAt as string) - Date.now()).toBeLessThanOrEqual(
        30 * 60 * 1000,
      );

      await expect(
        service.transition(prepared, {
          expected: ['claimed'],
          operationId: 'op-settle',
          phase: 'dispatched',
        }),
      ).resolves.toMatchObject({ phase: 'dispatched' });
    });

    it('C03 — an internal claim without a settlement grant is rejected', async () => {
      const task = await seedAssignedTask('CAID-NOGRANT-1');

      await expect(
        new TaskDispatchService(db, workspaceId).prepare({
          idempotencyKey: 'orchestrator:CAID-NOGRANT-1:settle-1',
          origin: 'internal',
          requestedBy: userId,
          task,
          trigger: 'orchestrator',
        }),
      ).rejects.toMatchObject({ message: expect.stringContaining('settlement_grant_missing') });

      expect(await db.select().from(taskDispatches)).toHaveLength(0);
    });

    it('C03 — a grant bound to a superseded generation is rejected at claim time', async () => {
      const task = await seedAssignedTask('CAID-STALEGEN-1');
      const sourceDispatchId = await seedSettledSourceDispatch(task.id, 1);
      // The task has since advanced — generation 1 is now historical.
      await seedSettledSourceDispatch(task.id, 2);

      await expect(
        new TaskDispatchService(db, workspaceId).prepare({
          idempotencyKey: 'orchestrator:CAID-STALEGEN-1:settle-1',
          origin: 'internal',
          requestedBy: userId,
          settlementGrant: boundGrant(sourceDispatchId, 7),
          sourceDispatchId,
          task,
          trigger: 'orchestrator',
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('settlement_grant_source_stale'),
      });
    });

    it('C03 — a grant bound to another task is rejected', async () => {
      const task = await seedAssignedTask('CAID-XTASK-1');
      const other = await seedAssignedTask('CAID-XTASK-2');
      const otherDispatchId = await seedSettledSourceDispatch(other.id, 1);

      await expect(
        new TaskDispatchService(db, workspaceId).prepare({
          idempotencyKey: 'orchestrator:CAID-XTASK-1:settle-1',
          origin: 'internal',
          requestedBy: userId,
          settlementGrant: boundGrant(otherDispatchId, 1),
          sourceDispatchId: otherDispatchId,
          task,
          trigger: 'orchestrator',
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('settlement_grant_source_stale'),
      });
    });

    it('C03 — a grant past its deadline is rejected', async () => {
      const task = await seedAssignedTask('CAID-EXPIRED-1');
      const sourceDispatchId = await seedSettledSourceDispatch(task.id, 1);

      await expect(
        new TaskDispatchService(db, workspaceId).prepare({
          idempotencyKey: 'orchestrator:CAID-EXPIRED-1:settle-1',
          origin: 'internal',
          requestedBy: userId,
          settlementGrant: {
            ...boundGrant(sourceDispatchId, 1),
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          },
          sourceDispatchId,
          task,
          trigger: 'orchestrator',
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('settlement_grant_expired'),
      });
    });

    it('C04 — a grant that goes stale before final dispatch cancels the claim instead of dispatching', async () => {
      const task = await seedAssignedTask('CAID-LATE-1');
      const sourceDispatchId = await seedSettledSourceDispatch(task.id, 1);
      const service = new TaskDispatchService(db, workspaceId);

      const prepared = await service.prepare({
        idempotencyKey: 'orchestrator:CAID-LATE-1:settle-1',
        origin: 'internal',
        requestedBy: userId,
        settlementGrant: boundGrant(sourceDispatchId, 1),
        sourceDispatchId,
        task,
        trigger: 'orchestrator',
      });
      expect(prepared.dispatch.phase).toBe('claimed');

      // The bound source delivery disappeared between claim and dispatch —
      // the grant no longer names a real delivery chain.
      await db.delete(taskDispatches).where(eq(taskDispatches.id, sourceDispatchId));

      await expect(
        service.transition(prepared, { expected: ['claimed'], phase: 'dispatched' }),
      ).rejects.toMatchObject({ message: expect.stringContaining('lost its lease') });

      const [canceled] = await db
        .select()
        .from(taskDispatches)
        .where(eq(taskDispatches.id, prepared.dispatch.id));
      expect(canceled).toMatchObject({
        leaseOwner: null,
        phase: 'canceled',
        waitingReason: 'settlement_grant_source_stale',
      });
      // No writer was produced.
      expect(canceled.operationId).toBeNull();
    });

    it('C04 — a reservation takeover grant verifies the live reservation at both boundaries', async () => {
      const task = await seedAssignedTask('CAID-RES-1');
      await db
        .update(tasks)
        .set({
          runReservationExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
          runReservationId: 'reservation-9',
        })
        .where(eq(tasks.id, task.id));
      const service = new TaskDispatchService(db, workspaceId);

      const prepared = await service.prepare({
        idempotencyKey: 'orchestrator:CAID-RES-1:takeover-1',
        origin: 'internal',
        requestedBy: userId,
        settlementGrant: {
          allowedIntents: ['repair'],
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          kind: 'reservation_takeover',
          reservationId: 'reservation-9',
          workspaceId,
        },
        task,
        trigger: 'orchestrator',
      });
      expect(prepared.dispatch.phase).toBe('claimed');

      // The reservation lapses before final dispatch — the takeover no
      // longer holds current authority.
      await db
        .update(tasks)
        .set({ runReservationExpiresAt: new Date(Date.now() - 1000) })
        .where(eq(tasks.id, task.id));

      await expect(
        service.transition(prepared, { expected: ['claimed'], phase: 'dispatched' }),
      ).rejects.toMatchObject({ message: expect.stringContaining('lost its lease') });

      const [canceled] = await db
        .select()
        .from(taskDispatches)
        .where(eq(taskDispatches.id, prepared.dispatch.id));
      expect(canceled).toMatchObject({
        phase: 'canceled',
        waitingReason: 'settlement_grant_reservation_stale',
      });
    });

    it('C04 — a plain reservation takeover grant naming no token is rejected as stale', async () => {
      const task = await seedAssignedTask('CAID-LEGACY-1');

      await expect(
        new TaskDispatchService(db, workspaceId).prepare({
          idempotencyKey: 'orchestrator:CAID-LEGACY-1:takeover-1',
          origin: 'internal',
          requestedBy: userId,
          settlementGrant: {
            expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            kind: 'reservation_takeover',
          },
          task,
          trigger: 'orchestrator',
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('settlement_grant_reservation_stale'),
      });
    });
  });
});
