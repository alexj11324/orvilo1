// @vitest-environment node
import type { TaskPlanningProposal } from '@orvilo/types';
import { desc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { GoalModel } from '@/database/models/goal';
import { GoalGraphModel } from '@/database/models/goalGraph';
import { LinearSyncModel } from '@/database/models/linearSync';
import { ProjectModel } from '@/database/models/project';
import {
  projects,
  taskDependencies,
  taskPlanningRevisions,
  taskPlanningScopes,
  tasks,
  users,
  workspaces,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';

import {
  LinearPlanningWorker,
  type TaskPlanningPlanner,
  type TaskPlanningSnapshot,
} from './planning';

const db: OrviloDatabase = await getTestDB();
const userId = 'planning-incremental-user';
const workspaceId = 'planning-incremental-workspace';
let projectSequence = 0;
let taskSequence = 0;
let eventSequence = 0;

const cleanup = async () => {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
};

beforeEach(async () => {
  await cleanup();
  projectSequence += 1;
  taskSequence = 0;
  eventSequence = 0;
  await db.insert(users).values({ id: userId });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Planning Incremental Workspace',
    primaryOwnerId: userId,
    slug: workspaceId,
  });
});

afterEach(cleanup);

const createProject = async () => {
  const project = await new ProjectModel(db, userId, workspaceId).create({
    identifier: `P${String(projectSequence).padStart(4, '0')}`,
    name: 'Incremental Planning Project',
  });
  await db
    .update(projects)
    .set({ orchestrationPolicy: { ...project.orchestrationPolicy, replanMode: 'suggest' } })
    .where(eq(projects.id, project.id));
  return project;
};

const createTask = async (projectId: string, parentTaskId?: string) => {
  const [task] = await db
    .insert(tasks)
    .values({
      createdByUserId: userId,
      identifier: `INC-${++taskSequence}`,
      instruction: `Instruction ${taskSequence}`,
      name: `Task ${taskSequence}`,
      parentTaskId,
      projectId,
      seq: taskSequence,
      workspaceId,
    })
    .returning();
  return task;
};

const recordEvent = async (input: {
  payload?: Record<string, unknown>;
  projectId?: string;
  taskId?: string | null;
  type?: 'linear.issue.changed' | 'task.requirement.changed' | 'task.status.changed';
}) =>
  new LinearSyncModel(db, workspaceId).recordDomainEvent({
    idempotencyKey: `planning-incremental:${++eventSequence}`,
    payload: input.payload ?? (input.taskId ? { taskId: input.taskId } : {}),
    projectId: input.projectId,
    source: 'user',
    taskId: input.taskId,
    type: input.type ?? 'task.requirement.changed',
  });

const noopProposal = (): TaskPlanningProposal => ({
  actions: [{ action: 'noop', reason: 'No additional task mutation is required.' }],
  explanation: 'The affected subgraph is already consistent.',
  requiresApproval: false,
});

const latestRevisionForProject = async (projectId: string) => {
  const scope = await new LinearSyncModel(db, workspaceId).findPlanningScope('project', projectId);
  if (!scope) throw new Error('Planning scope was not created');
  const [revision] = await db
    .select()
    .from(taskPlanningRevisions)
    .where(eq(taskPlanningRevisions.scopeId, scope.id))
    .orderBy(desc(taskPlanningRevisions.inputRevision))
    .limit(1);
  if (!revision) throw new Error('Planning revision was not created');
  return { revision, scope };
};

describe('LinearPlanningWorker incremental affected-subgraph planning', () => {
  it('C01 sends only the changed task and its dependency/tree neighbors', async () => {
    const project = await createProject();
    const parent = await createTask(project.id);
    const changed = await createTask(project.id, parent.id);
    const child = await createTask(project.id, changed.id);
    const upstream = await createTask(project.id);
    const downstream = await createTask(project.id);
    const unrelated = await createTask(project.id);
    await db.insert(taskDependencies).values([
      {
        dependsOnId: changed.id,
        taskId: upstream.id,
        type: 'blocks',
        userId,
        visibility: 'public',
        workspaceId,
      },
      {
        dependsOnId: changed.id,
        taskId: downstream.id,
        type: 'blocks',
        userId,
        visibility: 'public',
        workspaceId,
      },
    ]);
    await recordEvent({ projectId: project.id, taskId: changed.id });

    let snapshot: TaskPlanningSnapshot | undefined;
    const planner: TaskPlanningPlanner = async (input) => {
      snapshot = input;
      return noopProposal();
    };
    await new LinearPlanningWorker(db, workspaceId).processPending(planner);

    expect(snapshot?.impact).toEqual({ changedTaskIds: [changed.id], scopeWide: false });
    expect(snapshot?.tasks.map((task) => task.id)).toEqual(
      expect.arrayContaining([parent.id, changed.id, child.id, upstream.id, downstream.id]),
    );
    expect(snapshot?.tasks.map((task) => task.id)).not.toContain(unrelated.id);
    expect(snapshot?.tasks.find((task) => task.id === changed.id)).toMatchObject({ changed: true });
    expect(snapshot?.dependencies).toHaveLength(2);
    expect(snapshot?.truncation).toMatchObject({
      escalationRequired: false,
      truncated: false,
    });
  });

  it('C03 supersedes a proposal when a new scope event arrives after planning', async () => {
    const project = await createProject();
    const task = await createTask(project.id);
    await recordEvent({ projectId: project.id, taskId: task.id });
    const planner: TaskPlanningPlanner = async () => ({
      actions: [
        {
          action: 'update_task',
          patch: { name: 'Planner update' },
          reason: 'The changed requirement needs a clearer task name.',
          taskId: task.id,
        },
      ],
      explanation: 'Update the changed task.',
      requiresApproval: false,
    });
    await new LinearPlanningWorker(db, workspaceId).processPending(planner);
    const { revision } = await latestRevisionForProject(project.id);

    await recordEvent({
      payload: { data: { id: 'new-linear-issue' } },
      projectId: project.id,
      taskId: null,
      type: 'linear.issue.changed',
    });

    await expect(
      new LinearPlanningWorker(db, workspaceId).applyProposal(revision.id, userId, true),
    ).resolves.toEqual({ createdTaskIds: [], stale: true, updatedTaskIds: [] });
    expect((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].name).toBe('Task 1');
    expect(
      (
        await db
          .select()
          .from(taskPlanningRevisions)
          .where(eq(taskPlanningRevisions.id, revision.id))
      )[0].status,
    ).toBe('superseded');
  });

  it('C04 keeps the committed dependency graph acyclic', async () => {
    const project = await createProject();
    const prerequisite = await createTask(project.id);
    const dependent = await createTask(project.id);
    await db.insert(taskDependencies).values({
      dependsOnId: prerequisite.id,
      taskId: dependent.id,
      type: 'blocks',
      userId,
      visibility: 'public',
      workspaceId,
    });
    await recordEvent({ projectId: project.id, taskId: dependent.id });
    await new LinearPlanningWorker(db, workspaceId).processPending(async () => ({
      actions: [
        {
          action: 'set_dependency',
          dependsOnTaskId: dependent.id,
          operation: 'add',
          reason: 'The reverse edge is required.',
          taskId: prerequisite.id,
        },
      ],
      explanation: 'Attempt a dependency change.',
      requiresApproval: false,
    }));
    const { revision } = await latestRevisionForProject(project.id);

    await expect(
      new LinearPlanningWorker(db, workspaceId).applyProposal(revision.id, userId, true),
    ).rejects.toThrow('dependency cycle');
    expect(
      await db.select().from(taskDependencies).where(eq(taskDependencies.workspaceId, workspaceId)),
    ).toHaveLength(1);
  });

  it('C04 leaves a Goal-owned Task to the Goal coordinator', async () => {
    const project = await createProject();
    const task = await createTask(project.id);
    const goal = await new GoalModel(db, userId, workspaceId).create({
      projectId: project.id,
      subjectType: 'standalone',
      title: 'Goal-owned work',
    });
    const node = await new GoalGraphModel(db, userId, workspaceId).createNode(goal.id, {
      kind: 'task',
      title: 'Goal task',
    });
    if (!node) throw new Error('Goal task node was not created');
    await new GoalGraphModel(db, userId, workspaceId).bindTask(goal.id, node.id, task.id);
    await recordEvent({ projectId: project.id, taskId: task.id });
    await new LinearPlanningWorker(db, workspaceId).processPending(async () => ({
      actions: [
        {
          action: 'assign_task',
          assigneeUserId: userId,
          reason: 'Project planner should assign this task.',
          taskId: task.id,
        },
      ],
      explanation: 'Attempt to mutate Goal-owned work.',
      requiresApproval: false,
    }));
    const { revision } = await latestRevisionForProject(project.id);

    await expect(
      new LinearPlanningWorker(db, workspaceId).applyProposal(revision.id, userId, true),
    ).resolves.toEqual({ createdTaskIds: [], stale: true, updatedTaskIds: [] });
    expect(
      (await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].assigneeUserId,
    ).toBeNull();
    expect(
      (
        await db
          .select()
          .from(taskPlanningRevisions)
          .where(eq(taskPlanningRevisions.id, revision.id))
      )[0].error,
    ).toContain('Goal');
  });

  it('C06 coalesces burst events and requeues changes that arrive during planning', async () => {
    const project = await createProject();
    const task = await createTask(project.id);
    await recordEvent({ projectId: project.id, taskId: task.id });
    await recordEvent({ projectId: project.id, taskId: task.id, type: 'task.status.changed' });
    let input: TaskPlanningSnapshot | undefined;
    const planner: TaskPlanningPlanner = async (snapshot) => {
      input = snapshot;
      await recordEvent({ projectId: project.id, taskId: task.id });
      return noopProposal();
    };

    await new LinearPlanningWorker(db, workspaceId).processPending(planner);
    const { revision, scope } = await latestRevisionForProject(project.id);
    const currentScope = await new LinearSyncModel(db, workspaceId).findPlanningScopeById(scope.id);

    expect(input?.events).toHaveLength(2);
    expect(revision.eventIds).toHaveLength(2);
    expect(currentScope?.status).toBe('queued');
    expect(currentScope!.dirtyRevision).toBeGreaterThan(currentScope!.plannedRevision);
  });

  it('keeps a live planning lease during new events and rejects stale lease completion', async () => {
    const project = await createProject();
    const task = await createTask(project.id);
    await recordEvent({ projectId: project.id, taskId: task.id });
    const linear = new LinearSyncModel(db, workspaceId);
    const [firstClaim] = await linear.claimPlanningScopes(1, 1_234);
    expect(firstClaim).toMatchObject({ status: 'running' });
    expect(firstClaim.lockedUntil).toBeInstanceOf(Date);

    await recordEvent({ projectId: project.id, taskId: task.id, type: 'task.status.changed' });
    const active = await linear.findPlanningScopeById(firstClaim.id);
    expect(active).toMatchObject({ status: 'running' });
    expect(active?.lockedUntil).toEqual(firstClaim.lockedUntil);
    await expect(linear.claimPlanningScopes(1, 90_000)).resolves.toHaveLength(0);

    await db
      .update(taskPlanningScopes)
      .set({ lockedUntil: new Date('2000-01-01T00:00:00.000Z') })
      .where(eq(taskPlanningScopes.id, firstClaim.id));
    const [reclaimed] = await linear.claimPlanningScopes(1, 90_000);
    expect(reclaimed.id).toBe(firstClaim.id);
    expect(reclaimed.lockedUntil).not.toEqual(firstClaim.lockedUntil);

    await expect(
      linear.finishPlanningScope(
        firstClaim.id,
        firstClaim.dirtyRevision,
        'idle',
        firstClaim.lockedUntil!,
      ),
    ).resolves.toBeNull();
    await expect(
      linear.failPlanningScope(firstClaim.id, 'stale worker', firstClaim.lockedUntil!),
    ).resolves.toBeNull();
    await expect(linear.findPlanningScopeById(firstClaim.id)).resolves.toMatchObject({
      lockedUntil: reclaimed.lockedUntil,
      status: 'running',
    });
  });

  it('D06 keeps a failed auto-apply revision retryable without a duplicate planning receipt', async () => {
    const project = await createProject();
    await db
      .update(projects)
      .set({
        orchestrationPolicy: {
          ...project.orchestrationPolicy,
          autoDispatch: true,
          replanMode: 'apply',
        },
      })
      .where(eq(projects.id, project.id));
    const task = await createTask(project.id);
    await recordEvent({ projectId: project.id, taskId: task.id });
    const planner = vi
      .fn<TaskPlanningPlanner>()
      .mockResolvedValueOnce({
        actions: [
          {
            action: 'request_stop',
            reason: 'Exercise the failed auto-apply path.',
            taskId: task.id,
          },
        ],
        explanation: 'This invalid automatic stop must fail at the apply boundary.',
        requiresApproval: false,
      })
      .mockResolvedValueOnce(noopProposal());
    const worker = new LinearPlanningWorker(db, workspaceId);

    await expect(worker.processPending(planner)).resolves.toMatchObject({ failed: 1 });
    const failed = await latestRevisionForProject(project.id);
    expect(failed.revision.status).toBe('failed');
    expect(failed.scope.plannedRevision).toBeLessThan(failed.scope.dirtyRevision);

    await new LinearSyncModel(db, workspaceId).requeuePlanningScope(failed.scope.id);
    await expect(worker.processPending(planner)).resolves.toMatchObject({
      failed: 0,
      processed: 1,
    });
    const retried = await latestRevisionForProject(project.id);
    expect(retried.revision.id).toBe(failed.revision.id);
    expect(retried.revision.status).toBe('applied');
    expect(planner).toHaveBeenCalledTimes(2);
  });

  it('D06 resumes a committed auto-apply proposal after a crash before its wakeup', async () => {
    const project = await createProject();
    await db
      .update(projects)
      .set({
        orchestrationPolicy: {
          ...project.orchestrationPolicy,
          autoDispatch: true,
          replanMode: 'apply',
        },
      })
      .where(eq(projects.id, project.id));
    const task = await createTask(project.id);
    const change = await recordEvent({ projectId: project.id, taskId: task.id });
    const linear = new LinearSyncModel(db, workspaceId);
    const revision = await linear.createPlanningRevision({
      eventIds: [change.event.id],
      inputRevision: change.event.revision,
      inputSnapshot: {
        consistency: {
          bindingVersion: null,
          orchestrationPolicyRevision: project.orchestrationPolicyRevision,
        },
        tasks: [{ id: task.id, updatedAt: task.updatedAt.toISOString() }],
      },
      proposal: {
        actions: [
          {
            action: 'update_task',
            patch: { name: 'Recovered auto-apply' },
            reason: 'The persisted proposal must survive a worker exit.',
            taskId: task.id,
          },
        ],
        explanation: 'Apply the proposal already committed before the crash.',
        requiresApproval: false,
      },
      scopeId: change.scope!.id,
      status: 'proposed',
      trigger: change.scope!.lastTrigger!,
    });
    const planner = vi.fn<TaskPlanningPlanner>(async () => noopProposal());

    await expect(
      new LinearPlanningWorker(db, workspaceId).processPending(planner),
    ).resolves.toMatchObject({ failed: 0, processed: 1 });
    expect(planner).not.toHaveBeenCalled();
    expect((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].name).toBe(
      'Recovered auto-apply',
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

  it('C13 bounds automatic planning until a human-approved receipt resets the budget', async () => {
    const project = await createProject();
    await db
      .update(projects)
      .set({
        orchestrationPolicy: {
          ...project.orchestrationPolicy,
          autoDispatch: true,
          planningBudget: { maxRevisions: 1 },
          replanMode: 'apply',
        },
      })
      .where(eq(projects.id, project.id));
    const task = await createTask(project.id);
    const planner = vi.fn<TaskPlanningPlanner>(async () => noopProposal());
    const worker = new LinearPlanningWorker(db, workspaceId);

    await recordEvent({ projectId: project.id, taskId: task.id });
    await worker.processPending(planner);
    expect((await latestRevisionForProject(project.id)).revision.status).toBe('applied');

    await recordEvent({ projectId: project.id, taskId: task.id });
    await worker.processPending(planner);
    const budgetRevision = (await latestRevisionForProject(project.id)).revision;
    expect(budgetRevision.proposal).toMatchObject({
      actions: [{ action: 'escalate' }],
      requiresApproval: true,
    });
    expect(planner).toHaveBeenCalledTimes(1);

    await worker.applyProposal(budgetRevision.id, userId, true);
    await recordEvent({ projectId: project.id, taskId: task.id });
    await worker.processPending(planner);
    expect(planner).toHaveBeenCalledTimes(2);
    expect((await latestRevisionForProject(project.id)).revision.status).toBe('applied');
  });

  it('C14 leaves the existing Goal path alone when project replanning is disabled', async () => {
    const project = await createProject();
    const linear = new LinearSyncModel(db, workspaceId);
    const installation = await linear.upsertOAuthInstallation({
      accessTokenCiphertext: 'test-access-token',
      accessTokenExpiresAt: null,
      appActorId: 'planning-incremental-app',
      installedByUserId: userId,
      oauthClientId: 'planning-incremental-client',
      organizationId: 'planning-incremental-org',
      organizationName: 'Planning Incremental Org',
      refreshTokenCiphertext: 'test-refresh-token',
      scopes: ['read', 'write'],
    });
    await linear.upsertBinding({
      installationId: installation.id,
      linearProjectId: 'planning-incremental-linear-project',
      projectId: project.id,
      settings: { replanningEnabled: false },
    });
    const task = await createTask(project.id);
    const goal = await new GoalModel(db, userId, workspaceId).create({
      projectId: project.id,
      subjectType: 'standalone',
      title: 'Existing Goal flow',
    });
    const node = await new GoalGraphModel(db, userId, workspaceId).createNode(goal.id, {
      kind: 'task',
      title: 'Existing Goal task',
    });
    if (!node) throw new Error('Goal task node was not created');
    await new GoalGraphModel(db, userId, workspaceId).bindTask(goal.id, node.id, task.id);
    await recordEvent({ projectId: project.id, taskId: task.id });

    const planner = vi.fn<TaskPlanningPlanner>(async () => noopProposal());
    await new LinearPlanningWorker(db, workspaceId).processPending(planner);
    const { revision } = await latestRevisionForProject(project.id);
    const proposal = (
      await db.select().from(taskPlanningRevisions).where(eq(taskPlanningRevisions.id, revision.id))
    )[0].proposal;

    expect(planner).not.toHaveBeenCalled();
    expect(proposal).toMatchObject({
      actions: [{ action: 'noop' }],
      requiresApproval: false,
    });
    expect((await new GoalGraphModel(db, userId, workspaceId).getGraph(goal.id))?.nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: node.id, taskId: task.id })]),
    );
  });
});
