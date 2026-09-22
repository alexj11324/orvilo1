// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  taskActivities,
  taskCommentDrafts,
  taskComments,
  tasks,
  users,
  workspaces,
} from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { TaskModel } from '../task';
import { TaskCommentDraftModel } from '../taskCommentDraft';

const db: OrviloDatabase = await getTestDB();
const alice = 'draft-alice';
const bob = 'draft-bob';
const workspaceA = 'draft-workspace-a';
const workspaceB = 'draft-workspace-b';

beforeEach(async () => {
  await db.delete(users);
  await db.insert(users).values([{ id: alice }, { id: bob }]);
  await db.insert(workspaces).values([
    { id: workspaceA, name: 'Draft A', primaryOwnerId: alice, slug: workspaceA },
    { id: workspaceB, name: 'Draft B', primaryOwnerId: alice, slug: workspaceB },
  ]);
});

afterEach(async () => {
  await db.delete(users);
});

describe('TaskCommentDraftModel', () => {
  it('upserts one unsent draft per author and task without creating activity', async () => {
    const task = await new TaskModel(db, alice, workspaceA).create({
      instruction: 'Draft task',
      name: 'A task',
    });
    const model = new TaskCommentDraftModel(db, alice, workspaceA);
    const activityBefore = await db
      .select()
      .from(taskActivities)
      .where(eq(taskActivities.taskId, task.id));
    const first = await model.upsert(task.id, 'first', { root: { children: [] } });
    const second = await model.upsert(task.id, 'second', { root: { children: ['text'] } });

    expect(second?.id).toBe(first?.id);
    expect(second?.content).toBe('second');
    expect(second?.editorData).toEqual({ root: { children: ['text'] } });
    expect(await model.count()).toBe(1);
    expect((await model.list())[0]?.taskIdentifier).toBe(task.identifier);
    expect(await db.select().from(taskCommentDrafts)).toHaveLength(1);
    expect(await db.select().from(taskComments).where(eq(taskComments.taskId, task.id))).toEqual(
      [],
    );
    expect(
      await db.select().from(taskActivities).where(eq(taskActivities.taskId, task.id)),
    ).toEqual(activityBefore);
  });

  it('round-trips attachment-only editor data with empty markdown', async () => {
    const task = await new TaskModel(db, alice, workspaceA).create({
      instruction: 'Attach a file',
      name: 'Attachment draft',
    });
    const model = new TaskCommentDraftModel(db, alice, workspaceA);
    const editorData = {
      root: { children: [{ type: 'attachment', fileId: 'file-example' }] },
    };

    const saved = await model.upsert(task.id, '', editorData);

    expect(saved).toMatchObject({ content: '', editorData });
    expect(await model.get(task.id)).toMatchObject({ content: '', editorData });
    expect(await model.list()).toMatchObject([{ content: '', editorData }]);
  });

  it('resolves public identifiers and database IDs without relying on an ID prefix', async () => {
    const [task] = await db
      .insert(tasks)
      .values({
        createdByUserId: alice,
        id: 'taskparity0001',
        identifier: 'PTP-1',
        instruction: 'Imported task',
        seq: 1,
        workspaceId: workspaceA,
      })
      .returning();
    const model = new TaskCommentDraftModel(db, alice, workspaceA);

    expect(await model.upsert('PTP-1', 'from identifier')).toMatchObject({
      taskId: task.id,
      taskIdentifier: 'PTP-1',
    });
    expect(await model.get(task.id)).toMatchObject({ content: 'from identifier' });
    expect(await model.list()).toMatchObject([{ taskId: task.id, taskIdentifier: 'PTP-1' }]);
    expect(await model.delete('PTP-1')).toBe(true);
    expect(await model.get(task.id)).toBeNull();

    expect(await model.upsert(task.id, 'from database ID')).toMatchObject({ taskId: task.id });
    expect(await model.get('PTP-1')).toMatchObject({ content: 'from database ID' });
    expect(await model.delete(task.id)).toBe(true);
    expect(await model.count()).toBe(0);
  });

  it('prefers the current workspace when an unfiled task shares the identifier', async () => {
    const unfiled = await new TaskModel(db, alice).create({ instruction: 'Personal task' });
    const filed = await new TaskModel(db, alice, workspaceA).create({
      instruction: 'Workspace task',
    });
    expect(unfiled.identifier).toBe(filed.identifier);

    const model = new TaskCommentDraftModel(db, alice, workspaceA);
    expect(await model.upsert(filed.identifier, 'workspace text')).toMatchObject({
      taskId: filed.id,
    });
    expect(await model.get(filed.identifier)).toMatchObject({ taskId: filed.id });
  });

  it('isolates authors and workspaces for reads and deletes', async () => {
    const taskA = await new TaskModel(db, alice, workspaceA).create({
      instruction: 'Task A',
      name: 'Task A',
    });
    const taskB = await new TaskModel(db, alice, workspaceB).create({
      instruction: 'Task B',
      name: 'Task B',
    });
    const aliceA = new TaskCommentDraftModel(db, alice, workspaceA);
    const aliceB = new TaskCommentDraftModel(db, alice, workspaceB);
    const bobA = new TaskCommentDraftModel(db, bob, workspaceA);
    await aliceA.upsert(taskA.id, 'Alice A');
    await aliceB.upsert(taskB.id, 'Alice B');
    await bobA.upsert(taskA.id, 'Bob A');

    expect(await aliceA.count()).toBe(1);
    expect(await aliceB.count()).toBe(1);
    expect(await bobA.get(taskA.id)).toMatchObject({ content: 'Bob A' });
    expect(await aliceA.upsert(taskB.id, 'wrong workspace')).toBeNull();
    expect(await aliceA.delete(taskB.id)).toBe(false);
    expect(await aliceA.deleteAll()).toBe(1);
    expect(await aliceA.count()).toBe(0);
    expect(await aliceB.count()).toBe(1);
    expect(await bobA.count()).toBe(1);
  });

  it('hides a draft after task access is revoked and rejects further writes', async () => {
    const task = await new TaskModel(db, alice, workspaceA).create({
      instruction: 'Shared task',
      name: 'Shared task',
      visibility: 'public',
    });
    const bobDrafts = new TaskCommentDraftModel(db, bob, workspaceA);
    expect(await bobDrafts.upsert(task.id, 'Work in progress')).not.toBeNull();

    await db.update(tasks).set({ visibility: 'private' }).where(eq(tasks.id, task.id));

    expect(await bobDrafts.get(task.id)).toBeNull();
    expect(await bobDrafts.list()).toEqual([]);
    expect(await bobDrafts.count()).toBe(0);
    expect(await bobDrafts.upsert(task.id, 'should fail')).toBeNull();
    expect(await bobDrafts.delete(task.id)).toBe(true);
    expect(await db.select().from(taskCommentDrafts)).toHaveLength(0);
  });

  it('moves the same author draft into the new workspace on an authorized edit', async () => {
    const task = await new TaskModel(db, alice, workspaceA).create({
      instruction: 'Moving task',
      name: 'Moving task',
    });
    const oldScope = new TaskCommentDraftModel(db, alice, workspaceA);
    const newScope = new TaskCommentDraftModel(db, alice, workspaceB);
    await oldScope.upsert(task.id, 'old text');

    await db.update(tasks).set({ workspaceId: workspaceB }).where(eq(tasks.id, task.id));
    expect(await oldScope.list()).toEqual([]);
    expect(await newScope.upsert(task.id, 'new text')).toMatchObject({ content: 'new text' });
    expect(await newScope.count()).toBe(1);
    expect(await oldScope.count()).toBe(0);
    expect(await db.select().from(taskCommentDrafts)).toHaveLength(1);
  });

  it('recovers unsent drafts after tasks move without exposing another author or workspace', async () => {
    const oldScope = new TaskCommentDraftModel(db, alice, workspaceA);
    const newScope = new TaskCommentDraftModel(db, alice, workspaceB);
    const bobOldScope = new TaskCommentDraftModel(db, bob, workspaceA);
    const bobNewScope = new TaskCommentDraftModel(db, bob, workspaceB);
    const taskModel = new TaskModel(db, alice, workspaceA);
    const movedOne = await taskModel.create({ instruction: 'Move first task' });
    const movedTwo = await taskModel.create({ instruction: 'Move second task' });
    const stays = await taskModel.create({ instruction: 'Stay in A' });
    await oldScope.upsert(movedOne.id, 'Alice first');
    await oldScope.upsert(movedTwo.id, 'Alice second');
    await oldScope.upsert(stays.id, 'Alice stays');
    await bobOldScope.upsert(movedOne.id, 'Bob first');

    await db.update(tasks).set({ workspaceId: workspaceB }).where(eq(tasks.id, movedOne.id));
    await db.update(tasks).set({ workspaceId: workspaceB }).where(eq(tasks.id, movedTwo.id));

    expect((await newScope.list()).map((draft) => draft.content).sort()).toEqual([
      'Alice first',
      'Alice second',
    ]);
    expect(await newScope.count()).toBe(2);
    expect(await newScope.get(movedOne.identifier)).toMatchObject({ content: 'Alice first' });
    expect(await bobNewScope.get(movedOne.id)).toMatchObject({ content: 'Bob first' });
    expect(await bobNewScope.count()).toBe(1);
    expect(await oldScope.get(movedOne.id)).toBeNull();

    expect(await oldScope.deleteAll()).toBe(1);
    expect(await newScope.count()).toBe(2);
    expect(await newScope.delete(movedOne.identifier)).toBe(true);
    expect(await newScope.deleteAll()).toBe(1);
    expect(await bobNewScope.get(movedOne.id)).toMatchObject({ content: 'Bob first' });
    expect(await newScope.count()).toBe(0);
  });
});
