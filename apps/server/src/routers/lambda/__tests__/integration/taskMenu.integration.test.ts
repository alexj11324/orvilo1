// @vitest-environment node
import { type OrviloDatabase } from '@orvilo/database';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskModel } from '@/database/models/task';
import { TaskResourceModel } from '@/database/models/taskResource';
import {
  taskIssueRecurrences,
  taskIssueTemplates,
  taskResources,
  tasks,
  users,
  workspaceMembers,
  workspaces,
} from '@/database/schemas';
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

  it('keeps legacy-id resource reads and writes on the exact row', async () => {
    const other = await createIssue();
    const targetId = other.identifier;
    await testDB.insert(tasks).values({
      id: targetId,
      identifier: 'LEGACY-2',
      seq: 2,
      createdByUserId: ownerId,
      workspaceId,
      instruction: 'Exact legacy target',
    });
    const caller = callerFor(ownerId);
    const resource = await caller.addLink({
      id: targetId,
      kind: 'link',
      url: 'https://example.com/legacy-resource',
    });
    expect((await caller.links({ id: targetId })).data.map((row) => row.id)).toContain(
      resource.data.id,
    );
    expect((await caller.links({ id: other.id })).data).toEqual([]);
    expect((await caller.removeLink({ id: other.id, linkId: resource.data.id })).data).toBe(false);
    expect((await caller.removeLink({ id: targetId, linkId: resource.data.id })).data).toBe(true);
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

  type MenuCaller = ReturnType<typeof callerFor>;
  type Issue = Awaited<ReturnType<typeof createIssue>>;
  const templateId = '00000000-0000-4000-8000-000000000001';
  const writes: [string, (caller: MenuCaller, task: Issue) => Promise<unknown>][] = [
    [
      'addLink',
      (caller, task) => caller.addLink({ id: task.id, kind: 'link', url: 'https://example.com' }),
    ],
    ['removeLink', (caller, task) => caller.removeLink({ id: task.id, linkId: templateId })],
    [
      'restoreDescription',
      (caller, task) =>
        caller.restoreDescription({
          expectedDomainRevision: task.domainRevision,
          historyId: templateId,
          id: task.id,
        }),
    ],
    [
      'markDuplicate',
      (caller, task) =>
        caller.markDuplicate({
          expectedDomainRevision: task.domainRevision,
          id: task.id,
          targetId: task.id,
        }),
    ],
    [
      'clearDuplicate',
      (caller, task) =>
        caller.clearDuplicate({ expectedDomainRevision: task.domainRevision, id: task.id }),
    ],
    [
      'copyIssue',
      (caller, task) =>
        caller.copyIssue({ expectedDomainRevision: task.domainRevision, id: task.id }),
    ],
    [
      'createRelated',
      (caller, task) =>
        caller.createRelated({
          expectedDomainRevision: task.domainRevision,
          id: task.id,
          kind: 'related',
          name: 'Related',
        }),
    ],
    [
      'convertToProject',
      (caller, task) =>
        caller.convertToProject({
          expectedDomainRevision: task.domainRevision,
          id: task.id,
          identifier: 'MENU',
          issueName: 'Issue',
          name: 'Project',
        }),
    ],
    [
      'convertToTemplate',
      (caller, task) =>
        caller.convertToTemplate({
          expectedDomainRevision: task.domainRevision,
          id: task.id,
          name: 'Template',
        }),
    ],
    [
      'convertToRecurring',
      (caller, task) =>
        caller.convertToRecurring({
          cadence: 'week',
          expectedDomainRevision: task.domainRevision,
          firstDueDate: '2026-10-05',
          id: task.id,
          timezone: 'UTC',
        }),
    ],
    [
      'setRecurrenceEnabled',
      (caller, task) => caller.setRecurrenceEnabled({ enabled: false, id: task.id }),
    ],
    ['removeRecurrence', (caller, task) => caller.removeRecurrence({ id: task.id })],
  ];

  const snapshot = async (task: Issue) => ({
    issues: (await new TaskModel(testDB, ownerId, workspaceId).list({})).tasks.length,
    links: (await testDB.select().from(taskResources)).length,
    recurrences: (await testDB.select().from(taskIssueRecurrences)).length,
    row: await new TaskModel(testDB, ownerId, workspaceId).findById(task.id),
    templates: (await testDB.select().from(taskIssueTemplates)).length,
  });

  describe.each(writes)('%s', (_name, write) => {
    it.each([
      ['a non-member', outsiderId, workspaceId, 'FORBIDDEN'],
      ['a read-only member', viewerId, workspaceId, 'FORBIDDEN'],
      ['a member of another workspace', outsiderId, otherWorkspaceId, 'NOT_FOUND'],
    ] as const)('is rejected for %s', async (_who, userId, scope, code) => {
      const task = await createIssue();
      const before = await snapshot(task);

      await expect(write(callerFor(userId, scope), task)).rejects.toMatchObject({ code });
      expect(await snapshot(task)).toEqual(before);
    });
  });

  it('createFromTemplate is rejected for a non-member and a read-only member', async () => {
    for (const userId of [outsiderId, viewerId])
      await expect(callerFor(userId).createFromTemplate({ templateId })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
  });

  it('rejects ids that belong to another workspace', async () => {
    const task = await createIssue();
    const foreignIssue = await createIssue(outsiderId, otherWorkspaceId);
    const foreign = callerFor(outsiderId, otherWorkspaceId);
    const foreignLink = await foreign.addLink({
      id: foreignIssue.id,
      kind: 'link',
      url: 'https://example.com/foreign',
    });
    const foreignTemplate = await foreign.convertToTemplate({
      expectedDomainRevision: foreignIssue.domainRevision,
      id: foreignIssue.id,
      name: 'Foreign',
    });
    const member = callerFor(memberId);

    await expect(
      member.markDuplicate({
        expectedDomainRevision: task.domainRevision,
        id: task.id,
        targetId: foreignIssue.id,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      member.createFromTemplate({ templateId: foreignTemplate.data.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await member.templates()).data).toEqual([]);
    expect((await member.removeLink({ id: task.id, linkId: foreignLink.data.id })).data).toBe(
      false,
    );
    expect((await foreign.links({ id: foreignIssue.id })).data).toHaveLength(1);
    expect(await new TaskModel(testDB, ownerId, workspaceId).findById(task.id)).toMatchObject({
      duplicateOfTaskId: null,
    });
  });

  it('lets only its creator or a workspace owner pause, replace or remove a recurrence', async () => {
    const task = await createIssue();
    const convert = (caller: MenuCaller) =>
      caller.convertToRecurring({
        cadence: 'week',
        expectedDomainRevision: task.domainRevision,
        firstDueDate: '2026-10-05',
        id: task.id,
        timezone: 'UTC',
      });
    await testDB
      .insert(workspaceMembers)
      .values({ role: 'member', userId: outsiderId, workspaceId });
    await convert(callerFor(memberId));
    const other = callerFor(outsiderId);

    expect((await other.recurrence({ id: task.id })).data).toMatchObject({ userId: memberId });
    await expect(other.setRecurrenceEnabled({ enabled: false, id: task.id })).rejects.toMatchObject(
      { code: 'FORBIDDEN' },
    );
    await expect(other.removeRecurrence({ id: task.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(convert(other)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await other.recurrence({ id: task.id })).data).toMatchObject({
      enabled: true,
      userId: memberId,
    });

    const owner = callerFor(ownerId);
    expect((await owner.setRecurrenceEnabled({ enabled: false, id: task.id })).data).toMatchObject({
      enabled: false,
    });
    expect((await callerFor(memberId).removeRecurrence({ id: task.id })).data).toBe(true);
  });

  it('logs only the procedure and error code when a write fails unexpectedly', async () => {
    const task = await createIssue();
    const secretUrl = 'https://example.com/secret-path?token=abc';
    const error = Object.assign(new Error(`insert failed for ${secretUrl} "Private title"`), {
      code: '23505',
      params: [secretUrl, 'Private title'],
    });
    vi.spyOn(TaskResourceModel.prototype, 'add').mockRejectedValue(error);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const failure = await callerFor(memberId)
      .addLink({ id: task.id, kind: 'link', title: 'Private title', url: secretUrl })
      .catch((cause) => cause);

    expect(failure).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Issue update failed',
    });
    expect(failure.cause).toBeUndefined();
    expect(logged).toHaveBeenCalledExactlyOnceWith('[taskMenu] %s failed', 'addLink', {
      code: '23505',
      name: 'Error',
    });
    expect(JSON.stringify(logged.mock.calls)).not.toMatch(/secret-path|Private title/);
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
