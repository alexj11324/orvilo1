// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import {
  agents,
  tasks,
  taskTopics,
  topics,
  users,
  workspaceMembers,
  workspaces,
} from '@/database/schemas';

import {
  getWorkspaceIssueAgentProfile,
  isWorkspaceIssueAgentReadable,
  readableWorkspaceIssueTopicIds,
} from './workspaceIssueRead';

const db = await getTestDB();
const owner = 'issue-profile-owner';
const member = 'issue-profile-member';
const workspaceId = 'issue-profile-workspace';
const agentId = 'issue-profile-agent';
const cleanup = async () => {
  await db.delete(users).where(eq(users.id, owner));
  await db.delete(users).where(eq(users.id, member));
};
beforeEach(async () => {
  await cleanup();
  await db.insert(users).values([{ id: owner }, { id: member }]);
  await db
    .insert(workspaces)
    .values({ id: workspaceId, name: 'Issues', slug: workspaceId, primaryOwnerId: owner });
  await db.insert(workspaceMembers).values([
    { workspaceId, userId: owner, role: 'owner' },
    { workspaceId, userId: member, role: 'member' },
  ]);
  await db.insert(agents).values({
    id: agentId,
    slug: agentId,
    userId: owner,
    workspaceId,
    visibility: 'private',
    title: 'Issue executor',
    systemRole: 'private instructions',
    plugins: ['private-tool'],
    agencyConfig: {
      executionTarget: 'device',
      heterogeneousProvider: {
        type: 'codex',
        env: { TOKEN: 'fixture-only' },
        args: ['private-arg'],
      },
    },
  });
});
afterEach(cleanup);

const linkIssue = async () => {
  await db.insert(tasks).values({
    id: 'issue-profile-task',
    identifier: 'IP-1',
    seq: 1,
    instruction: 'Issue',
    createdByUserId: owner,
    workspaceId,
    assigneeAgentId: agentId,
    visibility: 'private',
  });
  await db
    .insert(topics)
    .values({ id: 'issue-profile-topic', userId: owner, workspaceId, agentId });
  await db.insert(taskTopics).values({
    taskId: 'issue-profile-task',
    topicId: 'issue-profile-topic',
    userId: owner,
    workspaceId,
    visibility: 'private',
    seq: 1,
  });
};

describe('workspace Issue conversation read access', () => {
  it('exposes a referenced private Agent profile without prompts, tool config, args or env', async () => {
    await linkIssue();
    expect(await isWorkspaceIssueAgentReadable(db, agentId, member, workspaceId)).toBe(true);
    expect(
      await readableWorkspaceIssueTopicIds(db, ['issue-profile-topic'], member, workspaceId),
    ).toEqual(new Set(['issue-profile-topic']));
    const profile = await getWorkspaceIssueAgentProfile(db, agentId, member, workspaceId);
    expect(profile).toMatchObject({
      id: agentId,
      title: 'Issue executor',
      agencyConfig: { heterogeneousProvider: { type: 'codex' } },
    });
    expect(profile).not.toHaveProperty('systemRole');
    expect(profile).not.toHaveProperty('plugins');
    expect(profile).not.toHaveProperty('agencyConfig.heterogeneousProvider.env');
    expect(profile).not.toHaveProperty('agencyConfig.heterogeneousProvider.args');
    await db.update(tasks).set({ assigneeAgentId: null }).where(eq(tasks.id, 'issue-profile-task'));
    expect(await getWorkspaceIssueAgentProfile(db, agentId, member, workspaceId)).toMatchObject({
      id: agentId,
    });
  });

  it('preserves standalone/private, personal and cross-workspace scope', async () => {
    expect(await getWorkspaceIssueAgentProfile(db, agentId, member, workspaceId)).toBeNull();
    await linkIssue();
    expect(await getWorkspaceIssueAgentProfile(db, agentId, member)).toBeNull();
    expect(await getWorkspaceIssueAgentProfile(db, agentId, member, 'other-workspace')).toBeNull();
    expect(
      await readableWorkspaceIssueTopicIds(db, ['issue-profile-topic'], member, 'other-workspace'),
    ).toEqual(new Set());
    expect(await getWorkspaceIssueAgentProfile(db, agentId, 'nonmember', workspaceId)).toBeNull();
  });

  it('rejects suspended members, deleted Issues and share-visitor topics', async () => {
    await linkIssue();
    await db
      .update(workspaceMembers)
      .set({ suspendedAt: new Date() })
      .where(eq(workspaceMembers.userId, member));
    expect(await getWorkspaceIssueAgentProfile(db, agentId, member, workspaceId)).toBeNull();
    expect(
      await readableWorkspaceIssueTopicIds(db, ['issue-profile-topic'], member, workspaceId),
    ).toEqual(new Set());
    await db
      .update(workspaceMembers)
      .set({ suspendedAt: null })
      .where(eq(workspaceMembers.userId, member));
    await db
      .update(topics)
      .set({ senderId: 'share-visitor' })
      .where(eq(topics.id, 'issue-profile-topic'));
    expect(
      await readableWorkspaceIssueTopicIds(db, ['issue-profile-topic'], member, workspaceId),
    ).toEqual(new Set());
    await db.update(topics).set({ senderId: null }).where(eq(topics.id, 'issue-profile-topic'));
    await db.update(tasks).set({ isDeleted: true }).where(eq(tasks.id, 'issue-profile-task'));
    expect(await getWorkspaceIssueAgentProfile(db, agentId, member, workspaceId)).toBeNull();
    expect(
      await readableWorkspaceIssueTopicIds(db, ['issue-profile-topic'], member, workspaceId),
    ).toEqual(new Set());
  });
});
