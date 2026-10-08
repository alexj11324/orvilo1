// @vitest-environment node
import { and, eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { seedPrimeRuntime } from '@/database/fixtures/seedPrimeRuntime';
import { TaskModel } from '@/database/models/task';
import { TaskLabelModel } from '@/database/models/taskLabel';
import {
  agentOperations,
  projects,
  taskDependencies,
  taskDispatches,
  taskIssueTemplates,
  tasks,
  users,
  workspaceMembers,
  workspaces,
} from '@/database/schemas';

import { TaskIssueDefinitionService } from './index';

const db = await getTestDB();
const userId = 'issue-definition-owner';
const readerId = 'issue-definition-reader';
const workspaceId = 'issue-definition-workspace';
const model = new TaskModel(db, userId, workspaceId);
const service = new TaskIssueDefinitionService(db, userId, workspaceId);
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
    .values({ id: workspaceId, slug: workspaceId, name: 'Definitions', primaryOwnerId: userId });
  await db.insert(workspaceMembers).values([
    { userId, workspaceId, role: 'owner' },
    { userId: readerId, workspaceId, role: 'member' },
  ]);
});
afterEach(clean);
describe('TaskIssueDefinitionService', () => {
  it('copies selected issue fields/sub-issues with fresh IDs while resetting all execution and automation state', async () => {
    const editorData = { root: { children: [{ type: 'paragraph', text: 'Body' }] } };
    const source = await model.create({
      name: 'Original',
      instruction: 'Body',
      editorData,
      description: 'Summary',
      priority: 2,
      dueDate: '2026-10-09',
      workflowCategory: 'todo',
      automationMode: 'schedule',
      schedulePattern: '* * * * *',
      config: { privateGrant: 'do-not-copy' },
      context: { scheduler: { tickToken: 'old-run' }, execution: { parked: { reason: 'paused' } } },
    });
    const child = await model.create({
      name: 'Child',
      instruction: 'Child body',
      priority: null,
      parentTaskId: source.id,
      workflowCategory: 'todo',
    });
    const labels = new TaskLabelModel(db, userId, workspaceId);
    const label = await labels.create({ name: 'Important' });
    await labels.assign(source.id, label.id);
    const current = (await model.findById(source.id))!;
    const result = await service.copyIssue({
      id: source.id,
      expectedDomainRevision: current.domainRevision,
      includeSubIssues: true,
      name: 'Copy',
    });
    expect(result.rootId).not.toBe(source.id);
    const copies = await model.findByIds(result.taskIds);
    const root = copies.find((copy) => copy.id === result.rootId)!;
    expect(root).toMatchObject({
      name: 'Copy',
      instruction: 'Body',
      editorData,
      description: 'Summary',
      priority: 2,
      dueDate: '2026-10-09',
      parentTaskId: null,
    });
    for (const copy of copies)
      expect(copy).toMatchObject({
        workflowCategory: 'todo',
        assigneeAgentId: null,
        assigneeUserId: null,
        automationMode: null,
        schedulePattern: null,
        currentTopicId: null,
        totalTopics: 0,
        runReservationId: null,
        config: {},
        context: {},
      });
    expect(copies.find((copy) => copy.id !== result.rootId)).toMatchObject({
      priority: null,
      name: 'Child',
      parentTaskId: result.rootId,
    });
    expect(await labels.listForTask(result.rootId)).toMatchObject([{ id: label.id }]);
    expect(
      await db
        .select()
        .from(agentOperations)
        .where(inArray(agentOperations.taskId, result.taskIds)),
    ).toHaveLength(0);
    expect(
      await db.select().from(taskDispatches).where(inArray(taskDispatches.taskId, result.taskIds)),
    ).toHaveLength(0);
    expect((await model.findById(child.id))?.parentTaskId).toBe(source.id);
  });
  it('rejects a stale copy revision after a concurrent issue edit', async () => {
    const source = await model.create({ instruction: 'Source', workflowCategory: 'todo' });
    await model.update(source.id, { name: 'Renamed' });
    await expect(
      service.copyIssue({ id: source.id, expectedDomainRevision: source.domainRevision }),
    ).rejects.toThrow('TASK_REVISION_CONFLICT');
  });
  it('persists actual related/blocked/blocking/parent relationships in the correct direction', async () => {
    const source = await model.create({
      instruction: 'Source',
      priority: 3,
      workflowCategory: 'todo',
    });
    const blocked = await service.createRelated({
      id: source.id,
      expectedDomainRevision: source.domainRevision,
      kind: 'blocked',
      name: 'Blocked issue',
    });
    expect(
      await db.select().from(taskDependencies).where(eq(taskDependencies.taskId, blocked.id)),
    ).toMatchObject([{ dependsOnId: source.id, type: 'blocks' }]);
    const current = (await model.findById(source.id))!;
    const parent = await service.createRelated({
      id: source.id,
      expectedDomainRevision: current.domainRevision,
      kind: 'parent',
      name: 'New parent',
    });
    expect((await model.findById(source.id))?.parentTaskId).toBe(parent.id);
    expect(parent).toMatchObject({ priority: 3, workflowCategory: 'todo' });
  });
  it('marks a duplicate without triage policy and rejects a duplicate canonical target', async () => {
    const source = await model.create({ instruction: 'Duplicate', workflowCategory: 'todo' });
    const target = await model.create({ instruction: 'Canonical', workflowCategory: 'todo' });
    const duplicate = await service.markDuplicate({
      id: source.id,
      targetId: target.id,
      expectedDomainRevision: source.domainRevision,
    });
    expect(duplicate).toMatchObject({
      duplicateOfTaskId: target.id,
      workflowCategory: 'canceled',
      triageStatus: 'duplicate',
    });
    const other = await model.create({ instruction: 'Other', workflowCategory: 'todo' });
    await expect(
      service.markDuplicate({
        id: other.id,
        targetId: source.id,
        expectedDomainRevision: other.domainRevision,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it('clears an existing duplicate with CAS while preserving its canceled workflow and other triage states', async () => {
    const source = await model.create({ instruction: 'Duplicate', workflowCategory: 'todo' });
    const target = await model.create({ instruction: 'Canonical', workflowCategory: 'todo' });
    await service.markDuplicate({
      id: source.id,
      targetId: target.id,
      expectedDomainRevision: source.domainRevision,
    });
    const duplicate = (await model.findById(source.id))!;
    await expect(
      service.clearDuplicate({ id: source.id, expectedDomainRevision: source.domainRevision }),
    ).rejects.toThrow('TASK_REVISION_CONFLICT');
    const cleared = await service.clearDuplicate({
      id: source.id,
      expectedDomainRevision: duplicate.domainRevision,
    });
    expect(cleared).toMatchObject({
      duplicateOfTaskId: null,
      triageStatus: null,
      workflowCategory: 'canceled',
    });
    const otherState = await model.update(source.id, {
      duplicateOfTaskId: target.id,
      triageStatus: 'accepted',
    });
    expect(
      await service.clearDuplicate({
        id: source.id,
        expectedDomainRevision: otherState!.domainRevision,
      }),
    ).toMatchObject({
      duplicateOfTaskId: null,
      triageStatus: 'accepted',
      workflowCategory: 'canceled',
    });
    // Legacy requested-private workspace Issues follow workspace collaboration.
    const privateSource = await model.create({
      instruction: 'Private',
      workflowCategory: 'todo',
      visibility: 'private',
    });
    await expect(
      new TaskIssueDefinitionService(db, readerId, workspaceId).clearDuplicate({
        id: privateSource.id,
        expectedDomainRevision: privateSource.domainRevision,
      }),
    ).resolves.toMatchObject({ id: privateSource.id, visibility: 'public' });
    const personal = await new TaskModel(db, userId).create({
      instruction: 'Personal private issue',
      workflowCategory: 'todo',
      visibility: 'private',
    });
    await expect(
      new TaskIssueDefinitionService(db, readerId).clearDuplicate({
        id: personal.id,
        expectedDomainRevision: personal.domainRevision,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('creates a real project and maps original/sub-issues as standalone issues transactionally', async () => {
    await seedPrimeRuntime(db, { userId, workspaceId });
    const source = await model.create({
      name: 'Large issue',
      instruction: 'Project goal',
      workflowCategory: 'todo',
    });
    const child = await model.create({
      instruction: 'Child',
      parentTaskId: source.id,
      workflowCategory: 'todo',
    });
    const result = await service.convertToProject({
      id: source.id,
      expectedDomainRevision: source.domainRevision,
      name: 'Converted project',
      identifier: 'CNV',
      issueName: 'Converted from issue',
    });
    expect(await db.select().from(projects).where(eq(projects.id, result.projectId))).toMatchObject(
      [{ name: 'Converted project', description: 'Project goal', status: 'backlog' }],
    );
    expect(await model.findByIds([source.id, child.id])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: source.id,
          name: 'Converted from issue',
          projectId: result.projectId,
          parentTaskId: null,
        }),
        expect.objectContaining({ id: child.id, projectId: result.projectId, parentTaskId: null }),
      ]),
    );
  });
  it('shares reusable workspace templates through source Issue readability', async () => {
    const source = await model.create({
      name: 'Template issue',
      instruction: 'Template body',
      workflowCategory: 'todo',
      visibility: 'private',
    });
    const template = await service.convertToTemplate({
      id: source.id,
      expectedDomainRevision: source.domainRevision,
      name: 'Saved definition',
    });
    expect(await service.templates()).toMatchObject([{ id: template.id }]);
    const created = await service.createFromTemplate({
      templateId: template.id,
      name: 'From template',
    });
    expect(created).toMatchObject({
      name: 'From template',
      instruction: 'Template body',
      workflowCategory: 'todo',
      automationMode: null,
    });
    const other = new TaskIssueDefinitionService(db, readerId, workspaceId);
    expect(await other.templates()).toMatchObject([{ id: template.id }]);
    await expect(other.createFromTemplate({ templateId: template.id })).resolves.toMatchObject({
      createdByUserId: readerId,
      visibility: 'public',
      workspaceId,
    });
    const foreign = new TaskIssueDefinitionService(db, readerId, 'foreign-template-workspace');
    expect(await foreign.templates()).toHaveLength(0);
    await expect(foreign.createFromTemplate({ templateId: template.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
  it('keeps personal and source-less templates creator-only', async () => {
    const personalModel = new TaskModel(db, userId);
    const personalService = new TaskIssueDefinitionService(db, userId);
    const personal = await personalModel.create({
      instruction: 'Personal private issue',
      workflowCategory: 'todo',
      visibility: 'private',
    });
    const personalTemplate = await personalService.convertToTemplate({
      id: personal.id,
      expectedDomainRevision: personal.domainRevision,
      name: 'Personal template',
    });
    expect(await personalService.templates()).toMatchObject([{ id: personalTemplate.id }]);
    const personalReader = new TaskIssueDefinitionService(db, readerId);
    expect(await personalReader.templates()).toHaveLength(0);
    await expect(
      personalReader.createFromTemplate({ templateId: personalTemplate.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const [sourceLess] = await db
      .insert(taskIssueTemplates)
      .values({
        definition: {
          editorData: null,
          instruction: 'Source-less fixture',
          labelIds: [],
          name: null,
          priority: null,
          projectId: null,
          teamId: null,
        },
        name: 'Source-less template',
        userId,
        visibility: 'public',
        workspaceId,
      })
      .returning();
    expect((await service.templates()).map((template) => template.id)).toContain(sourceLess.id);
    const reader = new TaskIssueDefinitionService(db, readerId, workspaceId);
    expect(await reader.templates()).toHaveLength(0);
    await expect(reader.createFromTemplate({ templateId: sourceLess.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
  it('rolls a copied tree back as one concern when a nested operation fails', async () => {
    const source = await model.create({ instruction: 'Source', workflowCategory: 'todo' });
    await expect(
      db.transaction(async (tx) => {
        await new TaskIssueDefinitionService(tx as typeof db, userId, workspaceId).copyIssue({
          id: source.id,
          expectedDomainRevision: source.domainRevision,
        });
        throw new Error('Abort copy');
      }),
    ).rejects.toThrow('Abort copy');
    expect(
      await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.createdByUserId, userId))),
    ).toHaveLength(1);
  });
});
