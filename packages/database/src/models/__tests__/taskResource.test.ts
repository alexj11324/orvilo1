// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { users, workspaceMembers, workspaces } from '../../schemas';
import { TaskModel } from '../task';
import { TaskResourceModel } from '../taskResource';

const db = await getTestDB();
const userId = 'issue-resource-owner';
const readerId = 'issue-resource-reader';
const workspaceId = 'issue-resource-workspace';
const otherWorkspaceId = 'issue-resource-other-workspace';
const model = new TaskResourceModel(db, userId, workspaceId);
const reader = new TaskResourceModel(db, readerId, workspaceId);
const clean = async () => {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, otherWorkspaceId));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(users).where(eq(users.id, readerId));
};
beforeEach(async () => {
  await clean();
  await db.insert(users).values([{ id: userId }, { id: readerId }]);
  await db
    .insert(workspaces)
    .values({ id: workspaceId, slug: workspaceId, name: 'Resources', primaryOwnerId: userId });
  await db.insert(workspaceMembers).values([
    { role: 'owner', userId, workspaceId },
    { role: 'member', userId: readerId, workspaceId },
  ]);
});
afterEach(clean);
const create = (visibility: 'public' | 'private' = 'public') =>
  new TaskModel(db, userId, workspaceId).create({
    instruction: 'Issue',
    visibility,
    workflowCategory: 'todo',
  });
describe('TaskResourceModel', () => {
  it('enforces live membership and viewer write restrictions in the model', async () => {
    const task = await create();
    const link = await model.add(task.id, { kind: 'link', url: 'https://example.com/keep' });
    await db
      .update(workspaceMembers)
      .set({ role: 'viewer' })
      .where(eq(workspaceMembers.userId, readerId));
    expect(await reader.list(task.id)).toHaveLength(1);
    await expect(
      reader.add(task.id, { kind: 'link', url: 'https://example.com/denied' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(reader.remove(task.id, link.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await db.delete(workspaceMembers).where(eq(workspaceMembers.userId, readerId));
    await expect(reader.list(task.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(reader.remove(task.id, link.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await model.list(task.id)).toHaveLength(1);
  });
  it('persists links and independent PR resources across reload and scopes deletion', async () => {
    const task = await create();
    const link = await model.add(task.id, {
      kind: 'link',
      title: 'Design',
      url: 'https://example.com/design',
    });
    await model.add(task.id, {
      kind: 'pull_request',
      title: 'Fix',
      url: 'https://github.com/example/repo/pull/12',
    });
    const reload = new TaskResourceModel(db, userId, workspaceId);
    expect(await reload.list(task.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'link',
          title: 'Design',
          url: 'https://example.com/design',
        }),
        expect.objectContaining({ kind: 'pull_request', title: 'Fix' }),
      ]),
    );
    expect(await reader.list(task.id)).toHaveLength(2);
    const other = await create();
    expect(await model.remove(other.id, link.id)).toBe(false);
    expect(await model.remove(task.id, link.id)).toBe(true);
    expect(await reload.list(task.id)).toHaveLength(1);
  });
  it('records links and pull requests added and removed in the Issue feed', async () => {
    const task = await create();
    const link = await model.add(task.id, { kind: 'link', title: 'Spec', url: 'https://x.test/a' });
    // The same URL again only retitles the resource: nothing new was attached.
    await model.add(task.id, { kind: 'link', title: 'Spec v2', url: 'https://x.test/a' });
    const pr = await model.add(task.id, {
      kind: 'pull_request',
      url: 'https://github.com/acme/app/pull/7',
    });
    await model.remove(task.id, link.id);
    await model.remove(task.id, link.id);

    const activities = await new TaskModel(db, userId, workspaceId).getActivities(task.id);
    expect(activities.map((a) => [a.type, a.actorUserId, a.payload])).toEqual([
      [
        'resource_added',
        userId,
        { actorKind: 'user', resourceKind: 'link', toLabel: 'Spec', url: 'https://x.test/a' },
      ],
      [
        'resource_added',
        userId,
        { actorKind: 'user', resourceKind: 'pull_request', toLabel: pr.title, url: pr.url },
      ],
      [
        'resource_removed',
        userId,
        { actorKind: 'user', resourceKind: 'link', toLabel: 'Spec v2', url: 'https://x.test/a' },
      ],
    ]);
  });

  it('rolls a link change back when its feed row cannot be written', async () => {
    const task = await create();
    const kept = await model.add(task.id, { kind: 'link', title: 'Kept', url: 'https://x.test/k' });
    const addActivity = vi
      .spyOn(TaskModel.prototype, 'addActivity')
      .mockRejectedValue(new Error('feed write failed'));

    try {
      await expect(model.add(task.id, { kind: 'link', url: 'https://x.test/new' })).rejects.toThrow(
        'feed write failed',
      );
      await expect(model.remove(task.id, kept.id)).rejects.toThrow('feed write failed');
    } finally {
      addActivity.mockRestore();
    }

    // Neither half-applied: the new link is not attached, the old one still is.
    expect((await model.list(task.id)).map((row) => row.url)).toEqual(['https://x.test/k']);
  });

  it('renames a link on its own Issue only, for writers only, and keeps its URL', async () => {
    const task = await create();
    const link = await model.add(task.id, {
      kind: 'link',
      title: 'Desing',
      url: 'https://example.com/design',
    });

    expect(await model.updateTitle(task.id, link.id, '  Design  ')).toMatchObject({
      id: link.id,
      title: 'Design',
      url: 'https://example.com/design',
    });
    await expect(model.updateTitle(task.id, link.id, '   ')).rejects.toThrow('Title is required');
    await db
      .update(workspaceMembers)
      .set({ role: 'viewer' })
      .where(eq(workspaceMembers.userId, readerId));
    await expect(reader.updateTitle(task.id, link.id, 'Viewer title')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    // A link is addressed through the Issue it belongs to.
    const other = await create();
    expect(await model.updateTitle(other.id, link.id, 'Elsewhere')).toBeUndefined();
    expect(await model.list(task.id)).toMatchObject([{ title: 'Design' }]);
  });
  it('shares legacy-private workspace Issue resources with active members', async () => {
    const task = await create('private');
    await model.add(task.id, { kind: 'link', url: 'https://example.com/private' });
    expect(await reader.list(task.id)).toHaveLength(1);
    await reader.add(task.id, { kind: 'link', url: 'https://example.com/member' });
    expect(await model.list(task.id)).toHaveLength(2);
  });
  it('does not leak resources across workspace scopes', async () => {
    const task = await create();
    await model.add(task.id, { kind: 'link', url: 'https://example.com/private' });
    await db.insert(workspaces).values({
      id: otherWorkspaceId,
      slug: otherWorkspaceId,
      name: 'Other resources',
      primaryOwnerId: userId,
    });
    await db
      .insert(workspaceMembers)
      .values({ role: 'owner', userId, workspaceId: otherWorkspaceId });
    const foreign = new TaskResourceModel(db, userId, otherWorkspaceId);
    await expect(foreign.list(task.id)).rejects.toThrow('Task not found');
    await expect(
      foreign.add(task.id, { kind: 'link', url: 'https://example.com/foreign' }),
    ).rejects.toThrow('Task not found');
    expect(await model.list(task.id)).toHaveLength(1);
  });
  it('keeps personal Issue resources owner-only', async () => {
    const task = await new TaskModel(db, userId).create({
      instruction: 'Personal Issue',
      visibility: 'private',
      workflowCategory: 'todo',
    });
    const personal = new TaskResourceModel(db, userId);
    await personal.add(task.id, { kind: 'link', url: 'https://example.com/personal' });
    expect(await personal.list(task.id)).toHaveLength(1);
    const other = new TaskResourceModel(db, readerId);
    await expect(other.list(task.id)).rejects.toThrow('Task not found');
    await expect(
      other.add(task.id, { kind: 'link', url: 'https://example.com/foreign' }),
    ).rejects.toThrow('Task not found');
    await expect(reader.list(task.id)).rejects.toThrow('Task not found');
    expect(await personal.list(task.id)).toHaveLength(1);
  });
  it.each(['javascript:alert(1)', 'file:///private/test', 'https://user:pass@example.com/test'])(
    'rejects unsafe URL %s',
    async (url) => {
      const task = await create();
      await expect(model.add(task.id, { kind: 'link', url })).rejects.toThrow('HTTP or HTTPS');
      expect(await model.list(task.id)).toHaveLength(0);
    },
  );
  it('rejects arbitrary URLs as pull requests and deduplicates resources', async () => {
    const task = await create();
    await expect(
      model.add(task.id, { kind: 'pull_request', url: 'https://example.com/pull/12' }),
    ).rejects.toThrow('GitHub pull request');
    await model.add(task.id, { kind: 'link', title: 'First', url: 'https://example.com' });
    await model.add(task.id, { kind: 'link', title: 'Updated', url: 'https://example.com' });
    expect(await model.list(task.id)).toMatchObject([{ title: 'Updated' }]);
  });
});
