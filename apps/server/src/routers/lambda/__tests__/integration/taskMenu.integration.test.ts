// @vitest-environment node
import { type OrviloDatabase } from '@orvilo/database';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskModel } from '@/database/models/task';
import { taskResources, users, workspaceMembers, workspaces } from '@/database/schemas';
import { EditLockService } from '@/server/services/editLock';

import { taskMenuRouter } from '../../taskMenu';
import { createTestContext } from './setup';

let testDB: OrviloDatabase;
vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(() => testDB),
}));

const ownerId = 'task-menu-owner';
const memberId = 'task-menu-member';
const viewerId = 'task-menu-viewer';
const outsiderId = 'task-menu-outsider';
const workspaceId = 'task-menu-workspace';
const otherWorkspaceId = 'task-menu-other-workspace';
const userIds = [ownerId, memberId, viewerId, outsiderId];

const clean = async () => {
  for (const id of [workspaceId, otherWorkspaceId])
    await testDB.delete(workspaces).where(eq(workspaces.id, id));
  for (const id of userIds) await testDB.delete(users).where(eq(users.id, id));
};

/** `null` addresses personal scope (no workspace selector). */
const callerFor = (userId: string, scope: string | null = workspaceId) =>
  taskMenuRouter.createCaller({
    ...createTestContext(userId),
    workspaceId: scope ?? undefined,
  } as never);

const createIssue = (userId = ownerId, scope: string | null = workspaceId) =>
  new TaskModel(testDB, userId, scope ?? undefined).create({
    instruction: 'Body',
    name: 'Issue',
    workflowCategory: 'todo',
  });

describe('Task Menu Router', () => {
  beforeEach(async () => {
    testDB = await getTestDB();
    await clean();
    await testDB.insert(users).values(userIds.map((id) => ({ id })));
    await testDB.insert(workspaces).values([
      { id: workspaceId, name: 'Task menu', primaryOwnerId: ownerId, slug: workspaceId },
      { id: otherWorkspaceId, name: 'Other', primaryOwnerId: outsiderId, slug: otherWorkspaceId },
    ]);
    await testDB.insert(workspaceMembers).values([
      { role: 'owner', userId: ownerId, workspaceId },
      { role: 'member', userId: memberId, workspaceId },
      { role: 'viewer', userId: viewerId, workspaceId },
      { role: 'owner', userId: outsiderId, workspaceId: otherWorkspaceId },
    ]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await clean();
  });

  it('requires authentication', async () => {
    const task = await createIssue();
    const anonymous = taskMenuRouter.createCaller({ workspaceId } as never);

    await expect(anonymous.links({ id: task.id })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(
      anonymous.addLink({ id: task.id, kind: 'link', url: 'https://example.com' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects a caller who is not a member of the addressed workspace', async () => {
    const task = await createIssue();
    const outsider = callerFor(outsiderId);

    await expect(outsider.links({ id: task.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(outsider.templates()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      outsider.addLink({ id: task.id, kind: 'link', url: 'https://example.com' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await testDB.select().from(taskResources)).toHaveLength(0);
  });

  it('lets a viewer read but not write', async () => {
    const task = await createIssue();
    await callerFor(memberId).addLink({
      id: task.id,
      kind: 'link',
      title: 'Spec',
      url: 'https://example.com/spec',
    });
    const viewer = callerFor(viewerId);

    expect((await viewer.links({ id: task.id })).data).toMatchObject([{ title: 'Spec' }]);
    expect((await viewer.descriptionHistory({ id: task.id })).data.versions).toEqual([]);
    expect((await viewer.recurrence({ id: task.id })).data).toBeNull();
    await expect(
      viewer.addLink({ id: task.id, kind: 'link', url: 'https://example.com/viewer' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      viewer.copyIssue({ expectedDomainRevision: task.domainRevision, id: task.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      viewer.markDuplicate({
        expectedDomainRevision: task.domainRevision,
        id: task.id,
        targetId: task.id,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await viewer.links({ id: task.id })).data).toHaveLength(1);
  });

  it('never resolves an issue from a workspace the caller did not address', async () => {
    const task = await createIssue();
    // A real member of another workspace, addressing their own workspace.
    const foreign = callerFor(outsiderId, otherWorkspaceId);

    await expect(foreign.links({ id: task.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(foreign.descriptionHistory({ id: task.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(foreign.recurrence({ id: task.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      foreign.addLink({ id: task.id, kind: 'link', url: 'https://example.com' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      foreign.copyIssue({ expectedDomainRevision: task.domainRevision, id: task.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      foreign.convertToTemplate({
        expectedDomainRevision: task.domainRevision,
        id: task.id,
        name: 'Stolen',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await foreign.templates()).data).toEqual([]);
  });

  it('keeps personal issues owner-only', async () => {
    const task = await createIssue(ownerId, null);
    expect(task.workspaceId).toBeNull();
    const other = callerFor(memberId, null);

    expect((await callerFor(ownerId, null).links({ id: task.id })).data).toEqual([]);

    await expect(other.links({ id: task.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      other.addLink({ id: task.id, kind: 'link', url: 'https://example.com' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'ftp://example.com/file',
    'https://user:pass@example.com/secret',
    'not a url',
  ])('rejects the unsafe link %s', async (url) => {
    const task = await createIssue();
    const member = callerFor(memberId);

    await expect(member.addLink({ id: task.id, kind: 'link', url })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect((await member.links({ id: task.id })).data).toEqual([]);
  });

  it('stores http(s) links and only accepts GitHub pull request URLs as pull requests', async () => {
    const task = await createIssue();
    const member = callerFor(memberId);

    const link = await member.addLink({ id: task.id, kind: 'link', url: 'http://example.com/a' });
    expect(link.data).toMatchObject({ addedByUserId: memberId, kind: 'link' });
    await expect(
      member.addLink({ id: task.id, kind: 'pull_request', url: 'https://example.com/pull/1' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await member.addLink({
      id: task.id,
      kind: 'pull_request',
      url: 'https://github.com/example/repo/pull/12',
    });
    expect((await member.links({ id: task.id })).data).toHaveLength(2);

    const other = await createIssue();
    expect((await member.removeLink({ id: other.id, linkId: link.data.id })).data).toBe(false);
    expect((await member.removeLink({ id: task.id, linkId: link.data.id })).data).toBe(true);
  });

  it('maps a stale revision to CONFLICT and restores a captured description', async () => {
    const task = await createIssue();
    const member = callerFor(memberId);
    const edited = await new TaskModel(testDB, memberId, workspaceId).update(
      task.id,
      { instruction: 'Edited' },
      { source: 'user' },
    );
    const { versions } = (await member.descriptionHistory({ id: task.id })).data;
    expect(versions.map(({ captureSource }) => captureSource)).toEqual(['edit', 'baseline']);

    await expect(
      member.restoreDescription({
        expectedDomainRevision: task.domainRevision,
        historyId: versions[1].id,
        id: task.id,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      member.restoreDescription({
        expectedDomainRevision: edited!.domainRevision,
        historyId: versions[0].id,
        id: task.id,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const restored = await member.restoreDescription({
      expectedDomainRevision: edited!.domainRevision,
      historyId: versions[1].id,
      id: task.id,
    });
    expect(restored.data).toMatchObject({ instruction: 'Body' });
  });

  it('rejects writes to an issue another member holds the edit lock on', async () => {
    const task = await createIssue();
    const target = await createIssue();
    vi.spyOn(EditLockService.prototype, 'getBlockingHolder').mockResolvedValue(ownerId);
    const member = callerFor(memberId);

    await expect(
      member.markDuplicate({
        expectedDomainRevision: task.domainRevision,
        id: task.id,
        targetId: target.id,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: 'Task is being edited by another user' });
    await expect(
      member.convertToRecurring({
        cadence: 'week',
        expectedDomainRevision: task.domainRevision,
        firstDueDate: '2026-10-05',
        id: task.id,
        timezone: 'UTC',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const current = await new TaskModel(testDB, ownerId, workspaceId).findById(task.id);
    expect(current).toMatchObject({ dueDate: null, duplicateOfTaskId: null });
  });

  it('marks and clears a duplicate, and creates a related issue, inside the caller workspace', async () => {
    const task = await createIssue();
    const target = await createIssue();
    const member = callerFor(memberId);

    const marked = await member.markDuplicate({
      expectedDomainRevision: task.domainRevision,
      id: task.id,
      targetId: target.id,
    });
    expect(marked.data).toMatchObject({
      duplicateOfTaskId: target.id,
      triageStatus: 'duplicate',
      workflowCategory: 'canceled',
    });
    const cleared = await member.clearDuplicate({
      expectedDomainRevision: marked.data!.domainRevision,
      id: task.id,
    });
    expect(cleared.data).toMatchObject({ duplicateOfTaskId: null, triageStatus: null });

    const related = await member.createRelated({
      expectedDomainRevision: cleared.data!.domainRevision,
      id: task.id,
      kind: 'sub_issue',
      name: 'Child',
    });
    expect(related.data).toMatchObject({
      createdByUserId: memberId,
      parentTaskId: task.id,
      workspaceId,
    });
  });
});
