// @vitest-environment node
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { LinearSyncModel } from '@/database/models/linearSync';
import { ProjectModel } from '@/database/models/project';
import { TaskDispatchModel } from '@/database/models/taskDispatch';
import {
  agents,
  linearInstallations,
  projectAgents,
  projects,
  taskDispatches,
  taskPlanningRevisions,
  tasks,
  users,
  workspaces,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';

import { LinearPlanningWorker } from './planning';

const runTask = vi.hoisted(() => vi.fn());

// CAID admission defaults to off; planning tests exercise the orchestrated
// wake path, so admission is allowed by default — one test flips it off.
const caidAdmission = vi.hoisted(() => ({ allowed: vi.fn(async () => true) }));
vi.mock('@/server/featureFlags/caidAdmission', () => ({
  isCaidDispatchAllowed: caidAdmission.allowed,
}));

vi.mock('@/server/services/taskRunner', () => ({
  TaskRunnerService: vi.fn(function () {
    return { runTask };
  }),
}));

const db: OrviloDatabase = await getTestDB();
const userId = 'planning-apply-user';
const workspaceId = 'planning-apply-workspace';
let projectSequence = 0;

const cleanup = async () => {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
};

beforeEach(async () => {
  vi.clearAllMocks();
  runTask.mockResolvedValue({ success: true });
  await cleanup();
  await db.insert(users).values({ id: userId });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Planning Apply Workspace',
    primaryOwnerId: userId,
    slug: workspaceId,
  });
});

afterEach(cleanup);

const createRevision = async (name: string, requiresApproval: boolean, projectScope = false) => {
  const linearModel = new LinearSyncModel(db, workspaceId);
  const project = projectScope
    ? await new ProjectModel(db, userId, workspaceId).create({
        identifier: `P${String(++projectSequence).padStart(5, '0')}`,
        name: 'Planning Apply Project',
      })
    : null;
  const installation = project
    ? (
        await db
          .insert(linearInstallations)
          .values({
            installedByUserId: userId,
            organizationId: `planning-org-${project.id}`,
            organizationName: 'Planning Apply Organization',
            workspaceId,
          })
          .returning()
      )[0]
    : null;
  const binding =
    project && installation
      ? await linearModel.upsertBinding({
          installationId: installation.id,
          linearProjectId: `linear-project-${project.id}`,
          projectId: project.id,
          settings: { replanningEnabled: true },
        })
      : null;
  const [task] = await db
    .insert(tasks)
    .values({
      createdByUserId: userId,
      identifier: 'PLAN-1',
      instruction: 'Apply the persisted plan',
      name: 'Before planning',
      projectId: project?.id,
      seq: 1,
      workspaceId,
    })
    .returning();
  const change = await linearModel.recordDomainEvent({
    idempotencyKey: `planning-apply:${name}`,
    payload: { taskId: task.id },
    projectId: task.projectId,
    source: 'user',
    taskId: task.id,
    type: 'task.requirement.changed',
  });
  const revision = await linearModel.createPlanningRevision({
    eventIds: [change.event.id],
    inputRevision: change.event.revision,
    inputSnapshot: {
      consistency: {
        bindingVersion: binding?.version ?? null,
        orchestrationPolicyRevision: project?.orchestrationPolicyRevision ?? null,
      },
      tasks: [{ id: task.id, updatedAt: task.updatedAt.toISOString() }],
    },
    proposal: {
      actions: [
        {
          action: 'update_task',
          patch: { name },
          reason: 'Apply the server-persisted proposal.',
          taskId: task.id,
        },
      ],
      explanation: 'Persisted planning proposal',
      requiresApproval,
    },
    scopeId: change.scope!.id,
    status: 'proposed',
    trigger: change.scope!.lastTrigger!,
  });
  return { binding, installation, project, revision, task };
};

describe('LinearPlanningWorker.applyProposal', () => {
  it('rejects request_resume outside a project planning scope', async () => {
    const { revision, task } = await createRevision('Workspace resume', false);
    await db
      .update(taskPlanningRevisions)
      .set({
        proposal: {
          actions: [
            {
              action: 'request_resume',
              instruction: 'Do not start without project policy.',
              reason: 'Exercise the workspace-scope guard.',
              taskId: task.id,
            },
          ],
          explanation: 'A workspace plan cannot auto-execute a task.',
          requiresApproval: false,
        },
      })
      .where(eq(taskPlanningRevisions.id, revision.id));

    await expect(
      new LinearPlanningWorker(db, workspaceId).applyProposal(revision.id, userId, true),
    ).rejects.toThrow('requires a task in the active scope');
    await expect(
      db.select().from(taskDispatches).where(eq(taskDispatches.taskId, task.id)),
    ).resolves.toHaveLength(0);
  });

  it('C08 commits a stable auto-dispatch intent before waking the task runner', async () => {
    const { project, revision, task } = await createRevision('Resume intent', false, true);
    const agentId = 'planning-resume-agent';
    await db.insert(agents).values({ id: agentId, userId, workspaceId });
    await db.insert(projectAgents).values({
      agentId,
      enabled: true,
      projectId: project!.id,
      workspaceId,
    });
    await db
      .update(projects)
      .set({
        orchestrationPolicy: {
          ...project!.orchestrationPolicy,
          autoDispatch: true,
          replanMode: 'apply',
        },
      })
      .where(eq(projects.id, project!.id));
    const [assignedTask] = await db
      .update(tasks)
      .set({ assigneeAgentId: agentId })
      .where(eq(tasks.id, task.id))
      .returning();
    await db
      .update(taskPlanningRevisions)
      .set({
        inputSnapshot: {
          consistency: {
            bindingVersion: 1,
            orchestrationPolicyRevision: project!.orchestrationPolicyRevision,
          },
          tasks: [{ id: task.id, updatedAt: assignedTask.updatedAt.toISOString() }],
        },
        proposal: {
          actions: [
            {
              action: 'request_resume',
              instruction: 'Continue from the reconciled Linear requirement.',
              reason: 'The task is ready and its dependencies are complete.',
              taskId: task.id,
            },
            {
              action: 'update_task',
              patch: { name: 'Updated before dispatch' },
              reason: 'The final execution contract needs the reconciled title.',
              taskId: task.id,
            },
          ],
          explanation: 'Resume the ready task through the durable dispatcher.',
          requiresApproval: false,
        },
      })
      .where(eq(taskPlanningRevisions.id, revision.id));

    await expect(
      new LinearPlanningWorker(db, workspaceId).applyProposal(revision.id, userId, true),
    ).resolves.toEqual({ createdTaskIds: [], stale: false, updatedTaskIds: [task.id] });
    const [finalTask] = await db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(finalTask.name).toBe('Updated before dispatch');
    await expect(
      db.select().from(taskDispatches).where(eq(taskDispatches.taskId, task.id)),
    ).resolves.toMatchObject([
      expect.objectContaining({
        agentId,
        idempotencyKey: `planning:${revision.id}:resume:${task.id}`,
        phase: 'requested',
        planRevision: revision.inputRevision,
        requirementRevision: finalTask.requirementRevision,
      }),
    ]);
    await expect(TaskDispatchModel.findPlanningStartCandidates(db)).resolves.toContainEqual({
      dispatchId: expect.any(String),
      idempotencyKey: `planning:${revision.id}:resume:${task.id}`,
      planRevision: revision.inputRevision,
      requestedBy: `orchestrator:planning:${revision.id}`,
      taskId: task.id,
      userId,
      workspaceId,
    });
    expect(runTask).toHaveBeenCalledWith({
      extraPrompt: 'Continue from the reconciled Linear requirement.',
      idempotencyKey: `planning:${revision.id}:resume:${task.id}`,
      planRevision: revision.inputRevision,
      requestedBy: `planning:${revision.id}`,
      taskId: task.id,
      trigger: 'orchestrator',
    });
  });

  it('C08b keeps the dispatch intent requested while CAID admission is off (R10)', async () => {
    caidAdmission.allowed.mockResolvedValue(false);
    const { project, revision, task } = await createRevision('Resume intent gated', false, true);
    const agentId = 'planning-resume-agent';
    await db.insert(agents).values({ id: agentId, userId, workspaceId });
    await db.insert(projectAgents).values({
      agentId,
      enabled: true,
      projectId: project!.id,
      workspaceId,
    });
    await db
      .update(projects)
      .set({
        orchestrationPolicy: {
          ...project!.orchestrationPolicy,
          autoDispatch: true,
          replanMode: 'apply',
        },
      })
      .where(eq(projects.id, project!.id));
    const [assignedTask] = await db
      .update(tasks)
      .set({ assigneeAgentId: agentId })
      .where(eq(tasks.id, task.id))
      .returning();
    await db
      .update(taskPlanningRevisions)
      .set({
        inputSnapshot: {
          consistency: {
            bindingVersion: 1,
            orchestrationPolicyRevision: project!.orchestrationPolicyRevision,
          },
          tasks: [{ id: task.id, updatedAt: assignedTask.updatedAt.toISOString() }],
        },
        proposal: {
          actions: [
            {
              action: 'request_resume',
              instruction: 'Continue from the reconciled Linear requirement.',
              reason: 'The task is ready and its dependencies are complete.',
              taskId: task.id,
            },
          ],
          explanation: 'Resume the ready task through the durable dispatcher.',
          requiresApproval: false,
        },
      })
      .where(eq(taskPlanningRevisions.id, revision.id));

    await expect(
      new LinearPlanningWorker(db, workspaceId).applyProposal(revision.id, userId, true),
    ).resolves.toMatchObject({ stale: false, updatedTaskIds: [task.id] });

    // The intent row commits 'requested' and stays sweep-visible — the
    // taskDispatchStart sweep re-drives it when admission flips back on —
    // instead of being woken (and dropped) in-line.
    expect(runTask).not.toHaveBeenCalled();
    await expect(
      db.select().from(taskDispatches).where(eq(taskDispatches.taskId, task.id)),
    ).resolves.toMatchObject([
      expect.objectContaining({
        idempotencyKey: `planning:${revision.id}:resume:${task.id}`,
        phase: 'requested',
      }),
    ]);
    await expect(TaskDispatchModel.findPlanningStartCandidates(db)).resolves.toContainEqual(
      expect.objectContaining({ idempotencyKey: `planning:${revision.id}:resume:${task.id}` }),
    );
  });

  it('C10 commits a fenced stop intent before the runtime interruption can be retried', async () => {
    const { revision, task } = await createRevision('Stop intent', false);
    await db.insert(taskDispatches).values({
      generation: task.executionGeneration,
      id: 'planning-stop-dispatch',
      idempotencyKey: 'planning-stop-dispatch-key',
      operationId: 'planning-stop-operation',
      phase: 'running',
      policyRevision: task.policyRevision,
      requestedBy: 'orchestrator:planning',
      requirementRevision: task.requirementRevision,
      taskId: task.id,
      taskRevision: task.domainRevision,
      workspaceId,
    });
    await db
      .update(taskPlanningRevisions)
      .set({
        proposal: {
          actions: [
            {
              action: 'request_stop',
              reason: 'The changed requirement invalidates the active run.',
              taskId: task.id,
            },
          ],
          explanation: 'Stop the active run at its safe dispatcher boundary.',
          requiresApproval: true,
        },
      })
      .where(eq(taskPlanningRevisions.id, revision.id));

    await expect(
      new LinearPlanningWorker(db, workspaceId).applyProposal(revision.id, userId, true),
    ).resolves.toEqual({ createdTaskIds: [], stale: false, updatedTaskIds: [task.id] });
    await expect(
      db.select().from(taskDispatches).where(eq(taskDispatches.id, 'planning-stop-dispatch')),
    ).resolves.toMatchObject([
      expect.objectContaining({
        fence: 1,
        operationId: 'planning-stop-operation',
        phase: 'cancel_requested',
      }),
    ]);
    expect(
      (
        await db
          .select()
          .from(taskPlanningRevisions)
          .where(eq(taskPlanningRevisions.id, revision.id))
      )[0].status,
    ).toBe('applied');

    const dispatchModel = new TaskDispatchModel(db, workspaceId);
    for (const phase of ['cancel_requested', 'outcome_unknown'] as const) {
      await db
        .update(taskDispatches)
        .set({ phase })
        .where(eq(taskDispatches.id, 'planning-stop-dispatch'));
      await expect(
        dispatchModel.request({
          idempotencyKey: `replacement:${phase}`,
          requestedBy: 'planning-test',
          taskId: task.id,
          trigger: 'orchestrator',
        }),
      ).resolves.toMatchObject({ state: 'busy', active: { phase } });
    }
  });

  it('loads the persisted proposal and enforces explicit approval', async () => {
    const { revision, task } = await createRevision('Server-approved name', true);
    const worker = new LinearPlanningWorker(db, workspaceId);

    await expect(worker.applyProposal(revision.id, userId, false)).rejects.toThrow(
      'requires explicit approval',
    );
    expect((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].name).toBe(
      'Before planning',
    );

    await expect(worker.applyProposal(revision.id, userId, true)).resolves.toMatchObject({
      stale: false,
      updatedTaskIds: [task.id],
    });
    expect((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].name).toBe(
      'Server-approved name',
    );
  });

  it('serializes concurrent apply attempts on the planning revision', async () => {
    const { revision, task } = await createRevision('Applied once', false);
    const worker = new LinearPlanningWorker(db, workspaceId);

    const results = await Promise.allSettled([
      worker.applyProposal(revision.id, userId, true),
      worker.applyProposal(revision.id, userId, true),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].name).toBe(
      'Applied once',
    );
    expect(
      (
        await db
          .select()
          .from(taskPlanningRevisions)
          .where(eq(taskPlanningRevisions.id, revision.id))
      )[0].status,
    ).toBe('applied');
  });

  it('supersedes a project proposal when its binding or policy changes', async () => {
    const { binding, installation, project, revision, task } = await createRevision(
      'Changed project guard',
      false,
      true,
    );
    const linearModel = new LinearSyncModel(db, workspaceId);

    await linearModel.upsertBinding({
      installationId: installation!.id,
      linearProjectId: `linear-project-${project!.id}`,
      projectId: project!.id,
      settings: { replanningEnabled: true },
    });
    await db
      .update(projects)
      .set({ orchestrationPolicyRevision: sql`${projects.orchestrationPolicyRevision} + 1` })
      .where(eq(projects.id, project!.id));

    expect((await linearModel.findBindingByProjectId(project!.id))?.version).toBe(2);

    await expect(
      new LinearPlanningWorker(db, workspaceId).applyProposal(revision.id, userId, true),
    ).resolves.toEqual({ createdTaskIds: [], stale: true, updatedTaskIds: [] });
    expect(binding!.version).toBe(1);
    expect((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].name).toBe(
      'Before planning',
    );
    expect(
      (
        await db
          .select()
          .from(taskPlanningRevisions)
          .where(eq(taskPlanningRevisions.id, revision.id))
      )[0].status,
    ).toBe('superseded');
  });

  it('supersedes a proposal when a task changes after planning', async () => {
    const { revision, task } = await createRevision('Task changed after planning', false);
    await db
      .update(tasks)
      .set({ name: 'Human changed name', updatedAt: new Date(task.updatedAt.getTime() + 1_000) })
      .where(eq(tasks.id, task.id));

    await expect(
      new LinearPlanningWorker(db, workspaceId).applyProposal(revision.id, userId, true),
    ).resolves.toEqual({ createdTaskIds: [], stale: true, updatedTaskIds: [] });
    expect((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].name).toBe(
      'Human changed name',
    );
  });

  it('supersedes a proposal when a human locks a targeted requirement field', async () => {
    const { revision, task } = await createRevision('Human locked name', false, true);
    await db.update(tasks).set({ requirementLocked: true }).where(eq(tasks.id, task.id));

    await expect(
      new LinearPlanningWorker(db, workspaceId).applyProposal(revision.id, userId, true),
    ).resolves.toEqual({ createdTaskIds: [], stale: true, updatedTaskIds: [] });
    expect((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].name).toBe(
      'Before planning',
    );
  });

  it('supersedes a child-creation proposal when its captured parent changes', async () => {
    const { project, revision, task } = await createRevision('Stale child parent', false, true);
    await db
      .update(taskPlanningRevisions)
      .set({
        proposal: {
          actions: [
            {
              action: 'create_task',
              description: 'A planned child',
              instruction: 'Implement the planned child',
              name: 'Planned child',
              parentTaskId: task.id,
              projectId: project!.id,
              reason: 'The parent needs a bounded child task',
            },
          ],
          explanation: 'Create one child task',
          requiresApproval: false,
        },
      })
      .where(eq(taskPlanningRevisions.id, revision.id));
    await db
      .update(tasks)
      .set({ name: 'Human changed parent', updatedAt: new Date(task.updatedAt.getTime() + 1_000) })
      .where(eq(tasks.id, task.id));

    await expect(
      new LinearPlanningWorker(db, workspaceId).applyProposal(revision.id, userId, true),
    ).resolves.toEqual({ createdTaskIds: [], stale: true, updatedTaskIds: [] });
    expect(await db.select().from(tasks).where(eq(tasks.workspaceId, workspaceId))).toHaveLength(1);
  });
});
