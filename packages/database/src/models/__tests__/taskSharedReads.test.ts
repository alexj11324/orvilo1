// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  agents,
  tasks,
  taskTopics,
  teams,
  topics,
  users,
  workspaceMembers,
  workspaces,
} from '../../schemas';
import { AgentModel } from '../agent';
import { TaskModel } from '../task';
import { TaskTopicModel } from '../taskTopic';
import { WorkQueryModel } from '../workQuery';

const db = await getTestDB();
const owner = 'issue-read-owner';
const member = 'issue-read-member';
const workspaceId = 'issue-read-workspace';
const otherWorkspaceId = 'issue-read-other-workspace';
const cleanup = async () => {
  await db.delete(users).where(eq(users.id, owner));
  await db.delete(users).where(eq(users.id, member));
};
beforeEach(async () => {
  await cleanup();
  await db.insert(users).values([{ id: owner }, { id: member }]);
  await db.insert(workspaces).values([
    { id: workspaceId, name: 'Issues', slug: workspaceId, primaryOwnerId: owner },
    { id: otherWorkspaceId, name: 'Other', slug: otherWorkspaceId, primaryOwnerId: owner },
  ]);
  await db.insert(workspaceMembers).values([
    { workspaceId, userId: owner, role: 'owner' },
    { workspaceId, userId: member, role: 'member' },
  ]);
  await db.insert(teams).values({
    id: 'issue-private-team',
    name: 'Private team',
    key: 'IPT',
    workspaceId,
    visibility: 'private',
    userId: owner,
  });
  await db.insert(agents).values({
    id: 'issue-private-agent',
    slug: 'issue-private-agent',
    workspaceId,
    userId: owner,
    visibility: 'private',
  });
});
afterEach(cleanup);

describe('workspace Issue reads', () => {
  it('reads legacy private Issues, private-team descendants and run history as a workspace member', async () => {
    const creator = new TaskModel(db, owner, workspaceId);
    const root = await creator.create({
      instruction: 'Shared Issue',
      visibility: 'private',
      teamId: 'issue-private-team',
      assigneeAgentId: 'issue-private-agent',
    });
    const child = await creator.create({
      instruction: 'Shared child',
      parentTaskId: root.id,
      visibility: 'private',
      teamId: 'issue-private-team',
    });
    await db.insert(topics).values({
      id: 'issue-private-topic',
      userId: owner,
      agentId: 'issue-private-agent',
      workspaceId,
    });
    await db.insert(taskTopics).values({
      taskId: root.id,
      topicId: 'issue-private-topic',
      userId: owner,
      workspaceId,
      visibility: 'private',
      seq: 1,
    });

    const reader = new TaskModel(db, member, workspaceId);
    expect(await reader.findById(root.id)).toMatchObject({ id: root.id, visibility: 'public' });
    expect(
      (
        await db.select({ visibility: tasks.visibility }).from(tasks).where(eq(tasks.id, root.id))
      )[0]?.visibility,
    ).toBe('private');
    expect((await reader.list()).tasks.map(({ id }) => id)).toEqual(
      expect.arrayContaining([root.id, child.id]),
    );
    expect((await reader.getTaskTree(root.id)).map(({ id }) => id)).toEqual(
      expect.arrayContaining([root.id, child.id]),
    );
    expect(
      await new TaskTopicModel(db, member, workspaceId).findByTopicId('issue-private-topic'),
    ).toMatchObject({ taskId: root.id });
    const result = await new WorkQueryModel(db, member, workspaceId).queryTasks({
      query: { entityType: 'task', groupBy: 'none', layout: 'list', schemaVersion: 1 },
    });
    expect(result.tasks.map(({ id }) => id)).toEqual(expect.arrayContaining([root.id, child.id]));
    expect(result.tasks.every(({ visibility }) => visibility === 'public')).toBe(true);
    expect((await reader.list({ visibility: 'public' })).tasks.map(({ id }) => id)).toEqual(
      expect.arrayContaining([root.id, child.id]),
    );
    const teamResult = await new WorkQueryModel(db, member, workspaceId).queryTasks({
      query: {
        entityType: 'task',
        schemaVersion: 1,
        filter: { all: [{ field: 'teamId', op: 'eq', value: 'issue-private-team' }] },
      },
    });
    expect(teamResult.tasks.map(({ id }) => id)).toEqual(
      expect.arrayContaining([root.id, child.id]),
    );
    for (const groupBy of ['assignee', 'agent', 'member', 'priority'] as const) {
      const groups = await reader.groupList({ groupBy });
      expect(
        groups.flatMap(({ tasks: rows }) => rows).find(({ id }) => id === root.id),
      ).toMatchObject({ visibility: 'public' });
    }
  });

  it('shares only the identity of an owner-personal Agent actually bound to the readable Issue or run', async () => {
    const personalAgentId = 'issue-owner-personal-agent';
    await db.insert(agents).values({
      id: personalAgentId,
      slug: personalAgentId,
      userId: owner,
      visibility: 'private',
      name: 'Personal runner',
      title: 'Codex runner',
      description: 'private description',
      systemRole: 'private instructions',
      agencyConfig: { heterogeneousProvider: { type: 'codex', env: { TOKEN: 'fixture-only' } } },
    });
    const issue = await new TaskModel(db, owner, workspaceId).create({
      instruction: 'Issue',
      assigneeAgentId: personalAgentId,
    });
    const readerAgents = new AgentModel(db, member, workspaceId);
    expect(await readerAgents.getAgentConfigById(personalAgentId)).toBeNull();
    expect(await readerAgents.getAgentAvatarsByIds([personalAgentId])).toEqual([]);
    const identity = await readerAgents.getAgentAvatarsByIds([personalAgentId], [issue.id]);
    expect(identity).toEqual([
      {
        id: personalAgentId,
        name: 'Personal runner',
        title: 'Codex runner',
        avatar: null,
        backgroundColor: null,
        heterogeneousType: 'codex',
      },
    ]);
    expect(JSON.stringify(identity)).not.toContain('fixture-only');
    expect(JSON.stringify(identity)).not.toContain('private description');
    expect(
      await new AgentModel(db, member, otherWorkspaceId).getAgentAvatarsByIds(
        [personalAgentId],
        [issue.id],
      ),
    ).toEqual([]);

    await db.update(tasks).set({ assigneeAgentId: null }).where(eq(tasks.id, issue.id));
    expect(await readerAgents.getAgentAvatarsByIds([personalAgentId], [issue.id])).toEqual([]);
    await db.insert(topics).values({
      id: 'issue-personal-history-topic',
      userId: owner,
      workspaceId,
      agentId: personalAgentId,
    });
    await db.insert(taskTopics).values({
      taskId: issue.id,
      topicId: 'issue-personal-history-topic',
      userId: owner,
      workspaceId,
      seq: 1,
    });
    expect(await readerAgents.getAgentAvatarsByIds([personalAgentId], [issue.id])).toMatchObject([
      { id: personalAgentId, title: 'Codex runner' },
    ]);

    const foreignOwner = 'issue-foreign-personal-owner';
    await db.insert(users).values({ id: foreignOwner });
    await db.insert(agents).values({
      id: 'issue-foreign-personal-agent',
      slug: 'issue-foreign-personal-agent',
      userId: foreignOwner,
      visibility: 'private',
      title: 'Foreign personal',
    });
    await db
      .update(tasks)
      .set({ assigneeAgentId: 'issue-foreign-personal-agent' })
      .where(eq(tasks.id, issue.id));
    expect(
      await readerAgents.getAgentAvatarsByIds(['issue-foreign-personal-agent'], [issue.id]),
    ).toEqual([]);
    await db.delete(users).where(eq(users.id, foreignOwner));
  });

  it('keeps personal and cross-workspace Issues scoped and rejects suspended workspace readers', async () => {
    const issue = await new TaskModel(db, owner, workspaceId).create({
      instruction: 'Workspace Issue',
      visibility: 'public',
    });
    const personal = await new TaskModel(db, owner).create({ instruction: 'Personal Issue' });
    expect(await new TaskModel(db, member).findById(personal.id)).toBeNull();
    expect(await new TaskModel(db, member, otherWorkspaceId).findById(issue.id)).toBeNull();
    expect(await new TaskModel(db, owner).findById(personal.id)).toMatchObject({ id: personal.id });
    await db
      .update(workspaceMembers)
      .set({ suspendedAt: new Date() })
      .where(eq(workspaceMembers.userId, member));
    expect(await new TaskModel(db, member, workspaceId).findById(issue.id)).toBeNull();
  });
});
