// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { documents, taskDocuments, users, workspaceMembers, workspaces } from '../../schemas';
import { TaskModel } from '../task';

const db = await getTestDB();
const userId = 'issue-doc-owner';
const otherUserId = 'issue-doc-reader';
const workspaceId = 'issue-doc-workspace';
const otherWorkspaceId = 'issue-doc-other-workspace';
const model = new TaskModel(db, userId, workspaceId);
const clean = async () => {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, otherWorkspaceId));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(users).where(eq(users.id, otherUserId));
};
beforeEach(async () => {
  await clean();
  await db.insert(users).values([{ id: userId }, { id: otherUserId }]);
  await db.insert(workspaces).values([
    { id: workspaceId, slug: workspaceId, name: 'Docs', primaryOwnerId: userId },
    { id: otherWorkspaceId, slug: otherWorkspaceId, name: 'Other', primaryOwnerId: userId },
  ]);
  await db.insert(workspaceMembers).values([
    { workspaceId, userId, role: 'owner' },
    { workspaceId, userId: otherUserId, role: 'member' },
  ]);
});
afterEach(clean);
const document = async (
  visibility: 'public' | 'private',
  ws: string | null = workspaceId,
  owner = userId,
) => {
  const [row] = await db
    .insert(documents)
    .values({
      title: 'Restricted document',
      content: 'Restricted body',
      userId: owner,
      workspaceId: ws,
      visibility,
      fileType: 'custom',
      sourceType: 'api',
      source: '',
      totalCharCount: 15,
      totalLineCount: 1,
    })
    .returning();
  return row;
};
describe('Task document ACL', () => {
  it('rejects private, foreign-owner and foreign-workspace documents on a shared issue', async () => {
    const task = await model.create({
      instruction: 'Shared',
      workflowCategory: 'todo',
      visibility: 'public',
    });
    const own = await document('private');
    const foreignOwner = await document('private', workspaceId, otherUserId);
    const foreignWorkspace = await document('public', otherWorkspaceId);
    await expect(model.pinDocument(task.id, own.id)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    await expect(model.pinDocument(task.id, foreignOwner.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(model.pinDocument(task.id, foreignWorkspace.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(await db.select().from(taskDocuments)).toHaveLength(0);
  });
  it('persists shared document attachments and rechecks read access after privacy changes', async () => {
    const task = await model.create({ instruction: 'Shared', workflowCategory: 'todo' });
    const doc = await document('public');
    await model.pinDocument(task.id, doc.id, 'user');
    expect(
      await new TaskModel(db, otherUserId, workspaceId).getPinnedDocuments(task.id),
    ).toHaveLength(1);
    await db.update(documents).set({ visibility: 'private' }).where(eq(documents.id, doc.id));
    expect(await model.getPinnedDocuments(task.id)).toHaveLength(1);
    expect(
      await new TaskModel(db, otherUserId, workspaceId).getPinnedDocuments(task.id),
    ).toHaveLength(0);
    expect(await model.getDocumentsPinnedSince(task.id, new Date(0))).toHaveLength(1);
    expect(
      await new TaskModel(db, otherUserId, workspaceId).getDocumentsPinnedSince(
        task.id,
        new Date(0),
      ),
    ).toHaveLength(0);
    const tree = await new TaskModel(db, otherUserId, workspaceId).getTreePinnedDocuments(task.id);
    expect(tree.nodeMap[doc.id]).toMatchObject({
      inaccessible: true,
      title: '',
      sourceTopicTitle: null,
    });
  });
  it('rejects private documents on legacy private workspace Issues and respects personal scope', async () => {
    const task = await model.create({
      instruction: 'Private',
      workflowCategory: 'todo',
      visibility: 'private',
    });
    const doc = await document('private');
    await expect(model.pinDocument(task.id, doc.id)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(await model.getPinnedDocuments(task.id)).toHaveLength(0);
    const personal = new TaskModel(db, userId);
    const personalTask = await personal.create({
      instruction: 'Personal',
      workflowCategory: 'todo',
    });
    const personalDoc = await document('private', null);
    await personal.pinDocument(personalTask.id, personalDoc.id);
    expect(await personal.getPinnedDocuments(personalTask.id)).toHaveLength(1);
  });
});
