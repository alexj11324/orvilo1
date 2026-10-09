// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { taskDescriptionHistories, users, workspaceMembers, workspaces } from '../../schemas';
import { TaskModel } from '../task';
import { TaskDescriptionHistoryModel } from '../taskDescriptionHistory';

const db = await getTestDB();
const userId = 'issue-history-owner';
const readerId = 'issue-history-reader';
const workspaceId = 'issue-history-workspace';
const model = new TaskModel(db, userId, workspaceId);
const history = new TaskDescriptionHistoryModel(db, userId, workspaceId);
const clean = async () => {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(users).where(eq(users.id, readerId));
};
beforeEach(async () => {
  await clean();
  await db.insert(users).values([{ id: userId }, { id: readerId }]);
  await db
    .insert(workspaces)
    .values({ id: workspaceId, slug: workspaceId, name: 'History', primaryOwnerId: userId });
  await db.insert(workspaceMembers).values([
    { workspaceId, userId, role: 'owner' },
    { workspaceId, userId: readerId, role: 'member' },
  ]);
});
afterEach(clean);
const editor = (text: string) => ({
  root: { children: [{ type: 'paragraph', children: [{ text, type: 'text' }] }] },
});
describe('TaskDescriptionHistoryModel', () => {
  it('allows viewer history reads but rejects restore and revoked membership', async () => {
    const task = await model.create({ instruction: 'First', workflowCategory: 'todo' });
    const edited = (await model.update(task.id, { instruction: 'Second' }))!;
    const versions = (await history.list(task.id)).versions;
    await db
      .update(workspaceMembers)
      .set({ role: 'viewer' })
      .where(eq(workspaceMembers.userId, readerId));
    const viewer = new TaskDescriptionHistoryModel(db, readerId, workspaceId);
    await expect(viewer.list(task.id)).resolves.toMatchObject({ versions: expect.any(Array) });
    await expect(
      viewer.restore(task.id, versions[1].id, edited.domainRevision),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await db.delete(workspaceMembers).where(eq(workspaceMembers.userId, readerId));
    await expect(viewer.list(task.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      viewer.restore(task.id, versions[1].id, edited.domainRevision),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await model.findById(task.id)).toMatchObject({
      instruction: 'Second',
      domainRevision: edited.domainRevision,
    });
    expect((await history.list(task.id)).versions).toHaveLength(2);
  });
  it('captures exact prior/new contents, restores and rejects stale CAS', async () => {
    const task = await model.create({
      instruction: 'First',
      editorData: editor('First'),
      workflowCategory: 'todo',
    });
    expect((await history.list(task.id)).versions).toHaveLength(0);
    const second = await model.update(
      task.id,
      { instruction: 'Second', editorData: editor('Second') },
      { expectedDomainRevision: task.domainRevision, source: 'user' },
    );
    const versions = (await history.list(task.id)).versions;
    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({
      instruction: 'Second',
      editorData: editor('Second'),
      captureSource: 'edit',
      authorUserId: userId,
    });
    expect(versions[1]).toMatchObject({
      instruction: 'First',
      editorData: editor('First'),
      captureSource: 'baseline',
      authorUserId: null,
    });
    await expect(history.restore(task.id, versions[1].id, task.domainRevision)).rejects.toThrow(
      'TASK_REVISION_CONFLICT',
    );
    expect((await history.list(task.id)).versions).toHaveLength(2);
    const restored = await history.restore(task.id, versions[1].id, second!.domainRevision);
    expect(restored).toMatchObject({ instruction: 'First', editorData: editor('First') });
    expect((await history.list(task.id)).versions).toHaveLength(3);
  });
  it('rejects restoring the currently displayed description version', async () => {
    const task = await model.create({ instruction: 'First', workflowCategory: 'todo' });
    const edited = await model.update(task.id, { instruction: 'Second' });
    const current = (await history.list(task.id)).versions[0];
    await expect(history.restore(task.id, current.id, edited!.domainRevision)).rejects.toThrow(
      'current description version',
    );
    expect((await history.list(task.id)).versions).toHaveLength(2);
  });

  it('does not fabricate versions for identical autosaves or unrelated edits', async () => {
    const task = await model.create({
      instruction: 'Initial',
      editorData: editor('Initial'),
      workflowCategory: 'todo',
    });
    await model.update(task.id, { instruction: 'Next', editorData: editor('Next') });
    await model.update(task.id, { name: 'Rename' });
    await model.update(task.id, { instruction: 'Next', editorData: editor('Next') });
    expect((await history.list(task.id)).versions).toHaveLength(2);
    await model.update(task.id, { instruction: 'Third', editorData: editor('Third') });
    expect((await history.list(task.id)).versions).toHaveLength(3);
  });
  it('captures shared current history for legacy private workspace Issues without exposing private historical snapshots', async () => {
    const task = await model.create({
      instruction: 'Current',
      visibility: 'private',
      workflowCategory: 'todo',
    });
    await db.insert(taskDescriptionHistories).values({
      taskId: task.id,
      userId,
      workspaceId,
      domainRevision: task.domainRevision,
      instruction: 'Historical private',
      captureSource: 'baseline',
      visibility: 'private',
    });
    const next = await model.update(task.id, { instruction: 'Shared next' });
    const readerHistory = new TaskDescriptionHistoryModel(db, readerId, workspaceId);
    const result = await readerHistory.list(task.id);
    expect(result.current.instruction).toBe('Shared next');
    expect(result.versions.map(({ instruction }) => instruction)).toEqual(['Shared next']);
    const privateVersion = (await history.list(task.id)).versions.find(
      ({ visibility }) => visibility === 'private',
    )!;
    await expect(
      readerHistory.restore(task.id, privateVersion.id, next!.domainRevision),
    ).rejects.toThrow('Description version not found');
    expect(
      (
        await db
          .select()
          .from(taskDescriptionHistories)
          .where(eq(taskDescriptionHistories.id, privateVersion.id))
      )[0]?.visibility,
    ).toBe('private');
  });
  it('rolls description and history back together when an enclosing transaction fails', async () => {
    const task = await model.create({ instruction: 'Initial', workflowCategory: 'todo' });
    await expect(
      db.transaction(async (tx) => {
        await new TaskModel(tx as typeof db, userId, workspaceId).update(task.id, {
          instruction: 'Uncommitted',
        });
        throw new Error('Rollback');
      }),
    ).rejects.toThrow('Rollback');
    expect((await model.findById(task.id))?.instruction).toBe('Initial');
    expect((await history.list(task.id)).versions).toHaveLength(0);
  });
});
