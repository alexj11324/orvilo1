import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { users, workspaceMembers, workspaces } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { ProjectModel } from '../project';
import { TaskModel } from '../task';

const serverDB: OrviloDatabase = await getTestDB();
const userId = 'milestone-progress-user';
const otherUserId = 'milestone-progress-other-user';
let projectSequence = 0;

/**
 * A project with exactly one milestone, plus the milestone read back through
 * the planning payload — the same path the app uses to render it.
 */
const createProjectWithMilestone = async (model: ProjectModel, name = 'Milestone project') => {
  const project = await model.create({
    identifier: `M${String(++projectSequence).padStart(5, '0')}`,
    milestones: [{ name: 'M1' }],
    name,
  });
  const planning = await model.getPlanning(project.id);
  if (!planning?.milestones[0]) throw new Error('Milestone fixture was not created');
  return { milestoneId: planning.milestones[0].id, project };
};

/** The readout as the planning payload carries it, i.e. what a surface renders. */
const readoutFromPlanning = async (model: ProjectModel, projectId: string, milestoneId: string) => {
  const planning = await model.getPlanning(projectId);
  const milestone = planning?.milestones.find((row) => row.id === milestoneId);
  if (!milestone) throw new Error('Milestone missing from the planning payload');
  return milestone.progress;
};

const complete = (model: TaskModel, taskId: string) =>
  model.update(taskId, { workflowCategory: 'done', workflowStateId: 'linear-state-done' });

describe('ProjectModel milestone progress', () => {
  const model = new ProjectModel(serverDB, userId);
  const otherModel = new ProjectModel(serverDB, otherUserId);

  beforeEach(async () => {
    await serverDB.delete(users);
    await serverDB.insert(users).values([{ id: userId }, { id: otherUserId }]);
  });

  afterEach(async () => {
    await serverDB.delete(users);
  });

  it('attaches a task to a milestone and reads the link back', async () => {
    const { milestoneId, project } = await createProjectWithMilestone(model);
    const tasks = new TaskModel(serverDB, userId);
    const task = await tasks.create({ instruction: 'Ship the thing', projectId: project.id });

    const linked = await model.setTaskMilestone({
      milestoneId,
      projectId: project.id,
      taskId: task.id,
    });

    expect(linked).toMatchObject({ id: task.id, projectMilestoneId: milestoneId });
    const readBack = await model.listTasks(project.id);
    expect(readBack).toEqual([
      expect.objectContaining({ id: task.id, projectMilestoneId: milestoneId }),
    ]);
  });

  it('reads an honest zero, then the percentage the linked work actually earns', async () => {
    const { milestoneId, project } = await createProjectWithMilestone(model);
    const tasks = new TaskModel(serverDB, userId);
    const [first, second] = [
      await tasks.create({ instruction: 'First', projectId: project.id }),
      await tasks.create({ instruction: 'Second', projectId: project.id }),
    ];

    // Nothing linked yet: zero, not a placeholder and not "unavailable".
    expect(await readoutFromPlanning(model, project.id, milestoneId)).toEqual({
      completed: 0,
      issues: 0,
      percent: 0,
    });
    expect(await model.listMilestoneProgress(project.id)).toEqual(new Map());

    await model.setTaskMilestone({ milestoneId, projectId: project.id, taskId: first.id });
    await model.setTaskMilestone({ milestoneId, projectId: project.id, taskId: second.id });
    await complete(tasks, first.id);

    // Two issues, one done.
    expect(await readoutFromPlanning(model, project.id, milestoneId)).toEqual({
      completed: 1,
      issues: 2,
      percent: 50,
    });

    await complete(tasks, second.id);

    expect(await readoutFromPlanning(model, project.id, milestoneId)).toEqual({
      completed: 2,
      issues: 2,
      percent: 100,
    });
  });

  it('leaves canceled work out of the denominator instead of the numerator', async () => {
    const { milestoneId, project } = await createProjectWithMilestone(model);
    const tasks = new TaskModel(serverDB, userId);
    const done = await tasks.create({ instruction: 'Done', projectId: project.id });
    const dropped = await tasks.create({ instruction: 'Dropped', projectId: project.id });
    const open = await tasks.create({ instruction: 'Open', projectId: project.id });
    for (const task of [done, dropped, open]) {
      await model.setTaskMilestone({ milestoneId, projectId: project.id, taskId: task.id });
    }
    await complete(tasks, done.id);
    await tasks.update(dropped.id, { workflowCategory: 'canceled' });

    // 1 of 2 — the canceled issue is neither progress nor scope.
    expect(await readoutFromPlanning(model, project.id, milestoneId)).toEqual({
      completed: 1,
      issues: 2,
      percent: 50,
    });
  });

  it('keeps a milestone with only canceled work at an honest zero', async () => {
    const { milestoneId, project } = await createProjectWithMilestone(model);
    const tasks = new TaskModel(serverDB, userId);
    const dropped = await tasks.create({ instruction: 'Dropped', projectId: project.id });
    await model.setTaskMilestone({ milestoneId, projectId: project.id, taskId: dropped.id });
    await tasks.update(dropped.id, { workflowCategory: 'canceled' });

    expect(await readoutFromPlanning(model, project.id, milestoneId)).toEqual({
      completed: 0,
      issues: 0,
      percent: 0,
    });
  });

  it('reports an unavailable readout rather than counting an unclassifiable state as open', async () => {
    const { milestoneId, project } = await createProjectWithMilestone(model);
    const tasks = new TaskModel(serverDB, userId);
    const task = await tasks.create({ instruction: 'Unknown state', projectId: project.id });
    await model.setTaskMilestone({ milestoneId, projectId: project.id, taskId: task.id });
    // A category this build cannot classify — reachable through the database
    // even though the type forbids it.
    await serverDB.execute(
      sql`UPDATE tasks SET workflow_category = 'blocked' WHERE id = ${task.id}`,
    );

    expect(await model.listMilestoneProgress(project.id)).toEqual(new Map([[milestoneId, null]]));
    expect(await readoutFromPlanning(model, project.id, milestoneId)).toBeNull();
  });

  it('detaches a task from its milestone', async () => {
    const { milestoneId, project } = await createProjectWithMilestone(model);
    const tasks = new TaskModel(serverDB, userId);
    const task = await tasks.create({ instruction: 'Detach me', projectId: project.id });
    await model.setTaskMilestone({ milestoneId, projectId: project.id, taskId: task.id });
    await complete(tasks, task.id);

    const detached = await model.setTaskMilestone({
      milestoneId: null,
      projectId: project.id,
      taskId: task.id,
    });

    expect(detached).toMatchObject({ id: task.id, projectMilestoneId: null });
    expect(await readoutFromPlanning(model, project.id, milestoneId)).toEqual({
      completed: 0,
      issues: 0,
      percent: 0,
    });
  });

  it('refuses a milestone that belongs to another project', async () => {
    const owner = await createProjectWithMilestone(model, 'Owner');
    const foreign = await createProjectWithMilestone(model, 'Foreign');
    const tasks = new TaskModel(serverDB, userId);
    const task = await tasks.create({ instruction: 'Mine', projectId: owner.project.id });

    await expect(
      model.setTaskMilestone({
        milestoneId: foreign.milestoneId,
        projectId: owner.project.id,
        taskId: task.id,
      }),
    ).rejects.toThrow('Milestone is not available in this project');
    expect(await model.listTasks(owner.project.id)).toEqual([
      expect.objectContaining({ id: task.id, projectMilestoneId: null }),
    ]);
  });

  it('refuses a task that belongs to another project', async () => {
    const owner = await createProjectWithMilestone(model, 'Owner');
    const foreign = await createProjectWithMilestone(model, 'Foreign');
    const tasks = new TaskModel(serverDB, userId);
    const task = await tasks.create({ instruction: 'Elsewhere', projectId: foreign.project.id });

    await expect(
      model.setTaskMilestone({
        milestoneId: owner.milestoneId,
        projectId: owner.project.id,
        taskId: task.id,
      }),
    ).rejects.toThrow('Task not found');
  });

  it('does not let a non-owner link a task', async () => {
    const { milestoneId, project } = await createProjectWithMilestone(model);
    const tasks = new TaskModel(serverDB, userId);
    const task = await tasks.create({ instruction: 'Not yours', projectId: project.id });

    expect(
      await otherModel.setTaskMilestone({ milestoneId, projectId: project.id, taskId: task.id }),
    ).toBeNull();
    expect(await otherModel.listMilestoneProgress(project.id)).toBeNull();
    expect(await model.listTasks(project.id)).toEqual([
      expect.objectContaining({ id: task.id, projectMilestoneId: null }),
    ]);
  });

  it('counts only the linked tasks the reader may see', async () => {
    const workspaceId = 'milestone-progress-ws';
    await serverDB.insert(workspaces).values({
      id: workspaceId,
      name: 'Milestone Progress Workspace',
      primaryOwnerId: userId,
      slug: workspaceId,
    });
    await serverDB.insert(workspaceMembers).values([
      { role: 'owner', userId, workspaceId },
      { role: 'member', userId: otherUserId, workspaceId },
    ]);
    const owner = new ProjectModel(serverDB, userId, workspaceId);
    const member = new ProjectModel(serverDB, otherUserId, workspaceId);
    const { milestoneId, project } = await createProjectWithMilestone(owner);
    const ownerTasks = new TaskModel(serverDB, userId, workspaceId);
    const publicTask = await ownerTasks.create({ instruction: 'Public', projectId: project.id });
    const privateTask = await ownerTasks.create({
      instruction: 'Owner private',
      projectId: project.id,
      visibility: 'private',
    });
    for (const task of [publicTask, privateTask]) {
      await owner.setTaskMilestone({ milestoneId, projectId: project.id, taskId: task.id });
    }
    await complete(ownerTasks, publicTask.id);

    // Each reader counts their own scope over the same milestone: the owner
    // sees both issues, the member only the public one.
    expect(await readoutFromPlanning(owner, project.id, milestoneId)).toEqual({
      completed: 1,
      issues: 2,
      percent: 50,
    });
    expect(await readoutFromPlanning(member, project.id, milestoneId)).toEqual({
      completed: 1,
      issues: 1,
      percent: 100,
    });
  });
});
