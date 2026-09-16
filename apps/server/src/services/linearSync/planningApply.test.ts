// @vitest-environment node
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { LinearSyncModel } from '@/database/models/linearSync';
import { ProjectModel } from '@/database/models/project';
import { projects, taskPlanningRevisions, tasks, users, workspaces } from '@/database/schemas';
import type { LobeChatDatabase } from '@/database/type';

import { LinearPlanningWorker } from './planning';

const db: LobeChatDatabase = await getTestDB();
const userId = 'planning-apply-user';
const workspaceId = 'planning-apply-workspace';
let projectSequence = 0;

const cleanup = async () => {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
};

beforeEach(async () => {
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
    ? await linearModel.upsertInstallation({
        installedByUserId: userId,
        organizationId: `planning-org-${project.id}`,
        organizationName: 'Planning Apply Organization',
      })
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
});
