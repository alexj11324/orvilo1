// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { taskLabelBindings, taskLabels, users, workspaces } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { TaskModel } from '../task';
import { TaskLabelModel } from '../taskLabel';

const serverDB: OrviloDatabase = await getTestDB();

const userId = 'task-label-test-user';
const otherUserId = 'task-label-test-user-2';
const workspaceId = 'task-label-test-ws';
const otherWorkspaceId = 'task-label-test-ws-2';

const personalModel = new TaskLabelModel(serverDB, userId);
const workspaceModel = new TaskLabelModel(serverDB, userId, workspaceId);
const memberModel = new TaskLabelModel(serverDB, otherUserId, workspaceId);

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.delete(workspaces);
  await serverDB.insert(users).values([{ id: userId }, { id: otherUserId }]);
  await serverDB.insert(workspaces).values([
    { id: workspaceId, name: 'Test WS', primaryOwnerId: userId, slug: 'task-label-test-ws' },
    {
      id: otherWorkspaceId,
      name: 'Other WS',
      primaryOwnerId: otherUserId,
      slug: 'task-label-test-ws-2',
    },
  ]);
});

afterEach(async () => {
  await serverDB.delete(taskLabels);
  await serverDB.delete(taskLabelBindings);
  await serverDB.delete(users);
  await serverDB.delete(workspaces);
});

const createTask = (owner: string, wsId?: string) =>
  new TaskModel(serverDB, owner, wsId).create({ instruction: 'Do the work' });

describe('TaskLabelModel', () => {
  describe('create / list', () => {
    it('creates a personal label with workspace_id NULL', async () => {
      const label = await personalModel.create({ color: '#ff0000', name: 'Bug' });

      expect(label).toMatchObject({ color: '#ff0000', name: 'Bug', userId, workspaceId: null });
      expect(await personalModel.list()).toHaveLength(1);
    });

    it('shares a workspace label across members', async () => {
      await workspaceModel.create({ name: 'Team Label' });

      const labels = await memberModel.list();
      expect(labels.map((label) => label.name)).toEqual(['Team Label']);
    });

    it('keeps scopes disjoint — a personal list never leaks workspace labels', async () => {
      await personalModel.create({ name: 'Personal' });
      await workspaceModel.create({ name: 'Workspace' });
      await new TaskLabelModel(serverDB, otherUserId, otherWorkspaceId).create({
        name: 'Foreign',
      });

      expect((await personalModel.list()).map((label) => label.name)).toEqual(['Personal']);
      // The owner's own unfiled label follows them into workspace scope
      // (buildWorkspaceWhere compat), but another workspace's never does.
      expect((await workspaceModel.list()).map((label) => label.name).sort()).toEqual([
        'Personal',
        'Workspace',
      ]);
      expect((await memberModel.list()).map((label) => label.name)).toEqual(['Workspace']);
    });

    it('enforces unique names per scope', async () => {
      await workspaceModel.create({ name: 'Dup' });
      await expect(workspaceModel.create({ name: 'Dup' })).rejects.toThrow();
      // A different scope may reuse the name.
      await personalModel.create({ name: 'Dup' });
    });
  });

  describe('assign / unassign', () => {
    it('assigns a label to a task and returns the full set', async () => {
      const task = await createTask(userId, workspaceId);
      const a = await workspaceModel.create({ name: 'A' });
      const b = await workspaceModel.create({ name: 'B' });

      const after = await workspaceModel.assign(task.id, a.id);
      expect(after.map((label) => label.id)).toEqual([a.id]);

      const both = await workspaceModel.assign(task.identifier, b.id);
      expect(both.map((label) => label.id).sort()).toEqual([a.id, b.id].sort());
      expect(await workspaceModel.listForTask(task.id)).toHaveLength(2);
    });

    it('is idempotent — assigning twice yields one binding', async () => {
      const task = await createTask(userId, workspaceId);
      const label = await workspaceModel.create({ name: 'Once' });

      await workspaceModel.assign(task.id, label.id);
      const again = await workspaceModel.assign(task.id, label.id);

      expect(again).toHaveLength(1);
      const bindings = await serverDB
        .select()
        .from(taskLabelBindings)
        .where(eq(taskLabelBindings.taskId, task.id));
      expect(bindings).toHaveLength(1);
    });

    it('unassigns exactly the named label and is a no-op when absent', async () => {
      const task = await createTask(userId, workspaceId);
      const keep = await workspaceModel.create({ name: 'Keep' });
      const drop = await workspaceModel.create({ name: 'Drop' });
      await workspaceModel.assign(task.id, keep.id);
      await workspaceModel.assign(task.id, drop.id);

      const after = await workspaceModel.unassign(task.id, drop.id);
      expect(after.map((label) => label.id)).toEqual([keep.id]);

      // Second unassign of the same pair must not fail or touch the survivor.
      const again = await workspaceModel.unassign(task.id, drop.id);
      expect(again.map((label) => label.id)).toEqual([keep.id]);
    });

    it('rejects a label that belongs to another scope', async () => {
      const task = await createTask(userId, workspaceId);
      const foreign = await new TaskLabelModel(serverDB, otherUserId, otherWorkspaceId).create({
        name: 'Foreign',
      });

      await expect(workspaceModel.assign(task.id, foreign.id)).rejects.toThrow(
        /not found in current scope/,
      );
      await expect(personalModel.assign(task.id, foreign.id)).rejects.toThrow(
        /not found in current scope|Task not found/,
      );
    });

    it('rejects a task the caller cannot resolve in scope', async () => {
      const foreignTask = await createTask(otherUserId, otherWorkspaceId);
      const label = await workspaceModel.create({ name: 'Mine' });

      await expect(workspaceModel.assign(foreignTask.id, label.id)).rejects.toThrow(
        /Task not found/,
      );
    });

    it('a member can label a workspace task and the whole workspace sees it', async () => {
      const task = await createTask(userId, workspaceId);
      const label = await workspaceModel.create({ name: 'Shared' });

      await memberModel.assign(task.id, label.id);

      expect((await workspaceModel.listForTask(task.id)).map((row) => row.id)).toEqual([label.id]);
    });
  });

  describe('listForTasks', () => {
    it('batches a page of tasks into one map, missing tasks absent', async () => {
      const a = await createTask(userId, workspaceId);
      const b = await createTask(userId, workspaceId);
      const bare = await createTask(userId, workspaceId);
      const label = await workspaceModel.create({ name: 'Marked' });
      await workspaceModel.assign(a.id, label.id);
      await workspaceModel.assign(b.id, label.id);

      const map = await workspaceModel.listForTasks([a.id, b.id, bare.id]);

      expect(map.get(a.id)?.map((row) => row.id)).toEqual([label.id]);
      expect(map.get(b.id)).toHaveLength(1);
      expect(map.has(bare.id)).toBe(false);
      expect(await workspaceModel.listForTasks([])).toEqual(new Map());
    });
  });
});
