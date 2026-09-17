// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { projectWorks, topics, works, workspaces } from '../../../schemas';
import { AgentDocumentModel } from '../../agentDocuments';
import { ProjectModel } from '../../project';
import { TaskModel } from '../../task';
import { WorkModel } from '..';
import {
  agentId,
  cleanupWorkTestData,
  expectDocumentSummaryItem,
  expectTaskSummaryItem,
  seedWorkTestData,
  serverDB,
  topicId,
  userId,
  userId2,
} from './_fixtures';

beforeEach(seedWorkTestData);
afterEach(cleanupWorkTestData);

/**
 * Register N task works sequentially so their `works.updatedAt` timestamps
 * differ, giving the keyset cursor a deterministic order to page over. Returns
 * the created works newest-first (registration order reversed) to mirror the
 * `desc(updatedAt)` list ordering.
 */
const seedTaskWorks = async (workModel: WorkModel, taskModel: TaskModel, count: number) => {
  const works = [];
  for (let index = 0; index < count; index += 1) {
    const task = await taskModel.create({
      instruction: `Task ${index}`,
      name: `Task ${index}`,
    });
    const work = await workModel.registerTask({
      changeType: 'created',
      rootOperationId: `op-workspace-${index}`,
      toolName: 'createTask',
      toolIdentifier: 'orvilo-task',
      toolCallId: `tool-call-workspace-${index}`,
      taskId: task.id,
      topicId,
    });
    works.push(work!);
  }
  return works.reverse();
};

describe('WorkModel · listByWorkspace', () => {
  it('lists works across topics and types, newest first', async () => {
    const otherTopicId = 'work-test-other-topic-id';
    await serverDB.insert(topics).values({ id: otherTopicId, userId });

    const taskModel = new TaskModel(serverDB, userId);
    const agentDocumentModel = new AgentDocumentModel(serverDB, userId);
    const workModel = new WorkModel(serverDB, userId);

    const firstTask = await taskModel.create({ instruction: 'First', name: 'First task' });
    const firstWork = await workModel.registerTask({
      changeType: 'created',
      rootOperationId: 'op-cross-1',
      toolName: 'createTask',
      toolIdentifier: 'orvilo-task',
      toolCallId: 'tool-call-cross-1',
      taskId: firstTask.id,
      topicId,
    });

    const doc = await agentDocumentModel.create(agentId, 'cross.md', 'Cross body', {
      title: 'Cross doc',
    });
    const docWork = await workModel.registerDocument({
      agentDocumentId: doc.id,
      agentId,
      documentId: doc.documentId,
      changeType: 'created',
      rootOperationId: 'op-cross-doc',
      toolName: 'createDocument',
      toolIdentifier: 'orvilo-agent-documents',
      toolCallId: 'tool-call-cross-doc',
      // Deliberately on a different topic to prove the query is cross-topic.
      topicId: otherTopicId,
    });

    const { items, nextCursor } = await workModel.listByWorkspace({});

    expect(nextCursor).toBeNull();
    expect(items.map((item) => item.id)).toEqual([docWork!.id, firstWork!.id]);
    expect(expectDocumentSummaryItem(items[0]).title).toBe('Cross doc');
    expect(expectTaskSummaryItem(items[1]).task.name).toBe('First task');
  });

  it('narrows to a single type when `type` is given', async () => {
    const taskModel = new TaskModel(serverDB, userId);
    const agentDocumentModel = new AgentDocumentModel(serverDB, userId);
    const workModel = new WorkModel(serverDB, userId);

    const task = await taskModel.create({ instruction: 'Typed', name: 'Typed task' });
    await workModel.registerTask({
      changeType: 'created',
      rootOperationId: 'op-typed-task',
      toolName: 'createTask',
      toolIdentifier: 'orvilo-task',
      toolCallId: 'tool-call-typed-task',
      taskId: task.id,
      topicId,
    });

    const doc = await agentDocumentModel.create(agentId, 'typed.md', 'Typed body', {
      title: 'Typed doc',
    });
    const docWork = await workModel.registerDocument({
      agentDocumentId: doc.id,
      agentId,
      documentId: doc.documentId,
      changeType: 'created',
      rootOperationId: 'op-typed-doc',
      toolName: 'createDocument',
      toolIdentifier: 'orvilo-agent-documents',
      toolCallId: 'tool-call-typed-doc',
      topicId,
    });

    const { items } = await workModel.listByWorkspace({ type: 'document' });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(docWork!.id);
    expect(items[0].type).toBe('document');
  });

  it('narrows to Works produced by one agent', async () => {
    const taskModel = new TaskModel(serverDB, userId);
    const workModel = new WorkModel(serverDB, userId);
    const firstTask = await taskModel.create({ instruction: 'First', name: 'First task' });
    const secondTask = await taskModel.create({ instruction: 'Second', name: 'Second task' });
    const firstWork = await workModel.registerTask({
      changeType: 'created',
      rootOperationId: 'op-agent-filter-1',
      toolCallId: 'tool-call-agent-filter-1',
      toolIdentifier: 'orvilo-task',
      toolName: 'createTask',
      taskId: firstTask.id,
      topicId,
    });
    await workModel.registerTask({
      changeType: 'created',
      rootOperationId: 'op-agent-filter-2',
      toolCallId: 'tool-call-agent-filter-2',
      toolIdentifier: 'orvilo-task',
      toolName: 'createTask',
      taskId: secondTask.id,
      topicId,
    });

    await serverDB.update(works).set({ originAgentId: agentId }).where(eq(works.id, firstWork!.id));

    const { items } = await workModel.listByWorkspace({
      originAgentId: agentId,
    });

    expect(items.map((item) => item.id)).toEqual([firstWork!.id]);
  });

  it('pages over the keyset cursor without gaps or overlaps', async () => {
    const taskModel = new TaskModel(serverDB, userId);
    const workModel = new WorkModel(serverDB, userId);
    const expected = await seedTaskWorks(workModel, taskModel, 5);

    const firstPage = await workModel.listByWorkspace({ limit: 2 });
    expect(firstPage.items.map((item) => item.id)).toEqual(expected.slice(0, 2).map((w) => w.id));
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await workModel.listByWorkspace({ cursor: firstPage.nextCursor, limit: 2 });
    expect(secondPage.items.map((item) => item.id)).toEqual(expected.slice(2, 4).map((w) => w.id));
    expect(secondPage.nextCursor).toBeTruthy();

    const thirdPage = await workModel.listByWorkspace({ cursor: secondPage.nextCursor, limit: 2 });
    expect(thirdPage.items.map((item) => item.id)).toEqual(expected.slice(4).map((w) => w.id));
    // Last page is short (1 of 2), so there is no further cursor.
    expect(thirdPage.nextCursor).toBeNull();
  });

  it('does not expose another owner works', async () => {
    const otherTopicId = 'work-test-other-owner-topic';
    await serverDB.insert(topics).values({ id: otherTopicId, userId: userId2 });

    const otherTaskModel = new TaskModel(serverDB, userId2);
    const otherWorkModel = new WorkModel(serverDB, userId2);
    const workModel = new WorkModel(serverDB, userId);

    const otherTask = await otherTaskModel.create({ instruction: 'Private', name: 'Private task' });
    await otherWorkModel.registerTask({
      changeType: 'created',
      rootOperationId: 'op-private',
      toolName: 'createTask',
      toolIdentifier: 'orvilo-task',
      toolCallId: 'tool-call-private',
      taskId: otherTask.id,
      topicId: otherTopicId,
    });

    const { items } = await workModel.listByWorkspace({});
    expect(items).toEqual([]);
  });

  it('keeps workspace external Works private to their registrant', async () => {
    const workspaceId = 'work-test-external-workspace';
    await serverDB.insert(workspaces).values({
      id: workspaceId,
      name: 'External Work Test Workspace',
      primaryOwnerId: userId,
      slug: workspaceId,
    });

    const ownerWorks = new WorkModel(serverDB, userId, workspaceId);
    const memberWorks = new WorkModel(serverDB, userId2, workspaceId);
    const work = await ownerWorks.registerExternal({
      changeType: 'created',
      identifier: 'alexj11324/orvilo1#42',
      resourceId: 'alexj11324/orvilo1#42',
      resourceType: 'github_issue',
      toolCallId: 'tool-call-private-external',
      toolIdentifier: 'github',
      toolName: 'create_issue',
    });

    expect(work).toMatchObject({ userId, visibility: 'private' });
    expect((await ownerWorks.listByWorkspace({})).items).toHaveLength(1);
    expect((await memberWorks.listByWorkspace({})).items).toHaveLength(0);
  });

  it('separates private and public Works for the Resources mode switch', async () => {
    const workspaceId = 'work-test-gallery-visibility-workspace';
    await serverDB.insert(workspaces).values({
      id: workspaceId,
      name: 'Gallery Visibility Test Workspace',
      primaryOwnerId: userId,
      slug: workspaceId,
    });

    const taskModel = new TaskModel(serverDB, userId, workspaceId);
    const workModel = new WorkModel(serverDB, userId, workspaceId);
    const privateTask = await taskModel.create({
      instruction: 'Private gallery task',
      name: 'Private gallery task',
      visibility: 'private',
    });
    const publicTask = await taskModel.create({
      instruction: 'Public gallery task',
      name: 'Public gallery task',
      visibility: 'public',
    });
    const privateWork = await workModel.registerTask({
      changeType: 'created',
      rootOperationId: 'op-gallery-private',
      taskId: privateTask.id,
      toolCallId: 'tool-call-gallery-private',
      toolIdentifier: 'orvilo-task',
      toolName: 'createTask',
      topicId,
    });
    const publicWork = await workModel.registerTask({
      changeType: 'created',
      rootOperationId: 'op-gallery-public',
      taskId: publicTask.id,
      toolCallId: 'tool-call-gallery-public',
      toolIdentifier: 'orvilo-task',
      toolName: 'createTask',
      topicId,
    });

    const combined = await workModel.listByWorkspace({});
    const privateOnly = await workModel.listByWorkspace({ visibility: 'private' });
    const publicOnly = await workModel.listByWorkspace({ visibility: 'public' });

    expect(combined.items.map((item) => item.id).sort()).toEqual(
      [privateWork!.id, publicWork!.id].sort(),
    );
    expect(privateOnly.items.map((item) => item.id)).toEqual([privateWork!.id]);
    expect(publicOnly.items.map((item) => item.id)).toEqual([publicWork!.id]);
  });

  it('flags an orphaned task work whose task was deleted without the tool', async () => {
    const taskModel = new TaskModel(serverDB, userId);
    const workModel = new WorkModel(serverDB, userId);
    const task = await taskModel.create({ instruction: 'Orphan', name: 'Orphan task' });

    await workModel.registerTask({
      changeType: 'created',
      rootOperationId: 'op-orphan-workspace',
      toolName: 'createTask',
      toolIdentifier: 'orvilo-task',
      toolCallId: 'tool-call-orphan-workspace',
      taskId: task.id,
      topicId,
    });

    // UI/CLI delete (no tool dispatch) leaves the Work orphaned; the LEFT JOIN
    // miss must render as `resourceDeleted` from the version snapshot, not drop it.
    await taskModel.delete(task.id);

    const { items } = await workModel.listByWorkspace({});
    expect(items).toHaveLength(1);
    const summary = expectTaskSummaryItem(items[0]);
    expect(summary.task.name).toBe('Orphan task');
    expect(summary.resourceDeleted).toBe(true);
  });
});

describe('WorkModel · listByWorkspace · project scope', () => {
  /**
   * `projects` has no column on `works`; the association is the `project_works`
   * join table (one Work may serve several projects). `ProjectModel.create` is
   * used rather than a raw insert so the NOT NULL `coordinatorAgentId` (and its
   * virtual agent) come from the same path production uses.
   */
  const createProject = async (ownerId: string, name: string, identifier: string) =>
    new ProjectModel(serverDB, ownerId).create({ identifier, name });

  const registerTaskWork = async (ownerId: string, name: string) => {
    const taskModel = new TaskModel(serverDB, ownerId);
    const workModel = new WorkModel(serverDB, ownerId);
    const task = await taskModel.create({ instruction: name, name });
    const work = await workModel.registerTask({
      changeType: 'created',
      rootOperationId: `op-project-${name}`,
      toolName: 'createTask',
      toolIdentifier: 'lobe-task',
      toolCallId: `tool-call-project-${name}`,
      taskId: task.id,
      topicId,
    });
    return { workModel, work: work! };
  };

  it('returns only the Works bound to the project, and composes with paging', async () => {
    const project = await createProject(userId, 'Bound', 'BND1');
    const other = await createProject(userId, 'Other', 'BND2');

    const first = await registerTaskWork(userId, 'Project one');
    const second = await registerTaskWork(userId, 'Project two');
    const elsewhere = await registerTaskWork(userId, 'Not in project');

    await serverDB.insert(projectWorks).values([
      { addedByUserId: userId, projectId: project.id, workId: first.work.id },
      { addedByUserId: userId, projectId: project.id, workId: second.work.id },
      { addedByUserId: userId, projectId: other.id, workId: elsewhere.work.id },
    ]);

    const all = await first.workModel.listByWorkspace({ projectId: project.id });
    expect(all.items.map((item) => item.id)).toEqual([second.work.id, first.work.id]);

    // The filter narrows within the same keyset pipeline: one Work still yields
    // one row, so `limit` counts Works and not join matches.
    const page = await first.workModel.listByWorkspace({ limit: 1, projectId: project.id });
    expect(page.items.map((item) => item.id)).toEqual([second.work.id]);
    expect(page.nextCursor).not.toBeNull();
  });

  it('lists a Work bound to two projects under each of them', async () => {
    const alpha = await createProject(userId, 'Alpha', 'ALP1');
    const beta = await createProject(userId, 'Beta', 'BET1');
    const { work, workModel } = await registerTaskWork(userId, 'Shared');

    await serverDB.insert(projectWorks).values([
      { addedByUserId: userId, projectId: alpha.id, workId: work.id },
      { addedByUserId: userId, projectId: beta.id, workId: work.id },
    ]);

    for (const projectId of [alpha.id, beta.id]) {
      const { items } = await workModel.listByWorkspace({ projectId });
      expect(items.map((item) => item.id)).toEqual([work.id]);
    }
  });

  it('returns nothing for a project id the caller cannot see', async () => {
    const foreignProject = await createProject(userId2, 'Foreign', 'FOR1');
    const foreign = await registerTaskWork(userId2, 'Foreign work');

    await serverDB
      .insert(projectWorks)
      .values({ addedByUserId: userId2, projectId: foreignProject.id, workId: foreign.work.id });

    // Ownership is enforced on the Work, so passing another user's project id
    // cannot widen the result — it simply matches no visible Work.
    const { items } = await new WorkModel(serverDB, userId).listByWorkspace({
      projectId: foreignProject.id,
    });
    expect(items).toEqual([]);
  });

  it('returns an empty page for a project with no bound Works', async () => {
    const empty = await createProject(userId, 'Empty', 'EMP1');
    const { workModel } = await registerTaskWork(userId, 'Unbound');

    const { items, nextCursor } = await workModel.listByWorkspace({ projectId: empty.id });
    expect(items).toEqual([]);
    expect(nextCursor).toBeNull();
  });
});
