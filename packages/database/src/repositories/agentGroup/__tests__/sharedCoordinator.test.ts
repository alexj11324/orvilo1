// @vitest-environment node
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../../core/getTestDB';
import { ChatGroupModel } from '../../../models/chatGroup';
import {
  agents,
  chatGroups,
  chatGroupsAgents,
  resourcePermissions,
  users,
  workspaceMembers,
  workspaces,
} from '../../../schemas';
import { AgentGroupRepository } from '../index';

const db = await getTestDB();
const userId = 'shared-coordinator-owner';
const otherId = 'shared-coordinator-other';
const workspaceId = 'shared-coordinator-workspace';
const repo = new AgentGroupRepository(db, userId, workspaceId);
const model = new ChatGroupModel(db, userId, workspaceId);

beforeEach(async () => {
  await db.delete(users);
  await db.insert(users).values([{ id: userId }, { id: otherId }]);
  await db
    .insert(workspaces)
    .values({ id: workspaceId, name: 'Group', slug: 'shared-coordinator', primaryOwnerId: userId });
});

const seed = async () => {
  const [agent] = await db
    .insert(agents)
    .values({
      title: 'Existing coordinator',
      userId,
      workspaceId,
      virtual: false,
      agencyConfig: { heterogeneousProvider: { type: 'codex' }, executionTarget: 'local' },
      visibility: 'public',
    })
    .returning();
  const [group] = await db
    .insert(chatGroups)
    .values({ title: 'Group', userId, workspaceId, visibility: 'private' })
    .returning();
  await db
    .insert(chatGroupsAgents)
    .values({ agentId: agent.id, chatGroupId: group.id, userId, workspaceId, role: 'supervisor' });
  return { agent, group };
};

describe('shared group coordinator', () => {
  it('reads a coordinator-less group without inserting an Agent', async () => {
    const [group] = await db
      .insert(chatGroups)
      .values({ title: 'Repairable', userId, workspaceId })
      .returning();
    const detail = await repo.findByIdWithAgents(group.id);
    expect(detail?.supervisorAgentId).toBeUndefined();
    expect(await db.select().from(agents)).toHaveLength(0);
  });

  it('keeps the selected Agent ID and never inserts another Agent at creation', async () => {
    await db.insert(workspaceMembers).values({ workspaceId, userId, role: 'owner' });
    const { agent } = await seed();
    const created = await repo.createGroupWithSupervisor(
      { title: 'Another group', visibility: 'private' },
      [agent.id],
      agent.id,
    );
    expect(created.supervisorAgentId).toBe(agent.id);
    expect(await db.select().from(agents)).toEqual([agent]);
    expect(created.agents).toHaveLength(1);
    expect(await db.select().from(resourcePermissions)).toEqual([]);
  });

  it('removes only the shared coordinator link', async () => {
    const { agent, group } = await seed();
    await repo.removeAgentsFromGroup(group.id, [agent.id]);
    expect((await db.select().from(agents).where(eq(agents.id, agent.id)))[0]).toEqual(agent);
    expect(
      await db.select().from(chatGroupsAgents).where(eq(chatGroupsAgents.chatGroupId, group.id)),
    ).toHaveLength(0);
  });

  it('deletes a Group without deleting its shared coordinator', async () => {
    const { agent, group } = await seed();
    await model.delete(group.id);
    expect((await db.select().from(agents).where(eq(agents.id, agent.id)))[0]).toEqual(agent);
  });

  it('publishes a Group without changing its shared coordinator visibility', async () => {
    const { agent, group } = await seed();
    await db.update(agents).set({ visibility: 'private' }).where(eq(agents.id, agent.id));
    await model.publishToWorkspace(group.id);
    expect((await db.select().from(agents).where(eq(agents.id, agent.id)))[0].visibility).toBe(
      'private',
    );
  });

  it('duplicates a Group by referencing the same shared coordinator', async () => {
    const { agent, group } = await seed();
    const result = await repo.duplicate(group.id);
    expect(result?.supervisorAgentId).toBe(agent.id);
    expect(await db.select().from(agents)).toEqual([agent]);
  });

  it('hands over a Group without changing the shared coordinator owner or configuration', async () => {
    const { agent, group } = await seed();
    await db.update(chatGroups).set({ visibility: 'public' }).where(eq(chatGroups.id, group.id));
    await db.transaction(async (tx) =>
      new ChatGroupModel(db, otherId, workspaceId).transferGroupOwnership(tx, {
        fromUserId: userId,
        toUserId: otherId,
        groupId: group.id,
      }),
    );
    expect((await db.select().from(agents).where(eq(agents.id, agent.id)))[0]).toEqual(agent);
    expect((await db.select().from(chatGroups).where(eq(chatGroups.id, group.id)))[0].userId).toBe(
      otherId,
    );
  });

  it('still cleans up actual legacy virtual members', async () => {
    const { agent, group } = await seed();
    const [owned] = await db
      .insert(agents)
      .values({ title: 'Legacy', userId, workspaceId, virtual: true })
      .returning();
    await db.insert(chatGroupsAgents).values({
      agentId: owned.id,
      chatGroupId: group.id,
      role: 'participant',
      userId,
      workspaceId,
    });
    await model.delete(group.id);
    expect((await db.select().from(agents).where(eq(agents.id, agent.id)))[0]).toEqual(agent);
    expect(await db.select().from(agents).where(eq(agents.id, owned.id))).toHaveLength(0);
  });

  it('does not expose an inaccessible shared coordinator config through Group detail', async () => {
    const { agent, group } = await seed();
    await db.update(chatGroups).set({ visibility: 'public' }).where(eq(chatGroups.id, group.id));
    await db.update(agents).set({ visibility: 'private' }).where(eq(agents.id, agent.id));
    const detail = await new AgentGroupRepository(db, otherId, workspaceId).findByIdWithAgents(
      group.id,
    );
    expect(detail?.supervisorAgentId).toBeUndefined();
    expect(detail?.agents).toEqual([]);
  });

  it('selects one accessible existing member atomically', async () => {
    const { agent, group } = await seed();
    const [second] = await db
      .insert(agents)
      .values({
        title: 'Second',
        userId,
        workspaceId,
        visibility: 'public',
        agencyConfig: { heterogeneousProvider: { type: 'codex' }, executionTarget: 'local' },
      })
      .returning();
    await model.addAgentsToGroup(group.id, [second.id]);
    await model.updateAgentInGroup(group.id, second.id, { role: 'supervisor' });
    const rows = await db
      .select()
      .from(chatGroupsAgents)
      .where(eq(chatGroupsAgents.chatGroupId, group.id));
    expect(rows.filter((row) => row.role === 'supervisor').map((row) => row.agentId)).toEqual([
      second.id,
    ]);
    expect((await db.select().from(agents).where(eq(agents.id, agent.id)))[0]).toEqual(agent);
  });

  it('refuses an unsupported coordinator without changing the existing Agent or Group role', async () => {
    const { agent, group } = await seed();
    const [unsupported] = await db
      .insert(agents)
      .values({
        title: 'Participant',
        userId,
        workspaceId,
        visibility: 'public',
        agencyConfig: { heterogeneousProvider: { type: 'pi' }, executionTarget: 'local' },
      })
      .returning();
    await model.addAgentsToGroup(group.id, [unsupported.id]);
    await expect(
      model.updateAgentInGroup(group.id, unsupported.id, { role: 'supervisor' }),
    ).rejects.toThrow('ORCHESTRATOR_RUNTIME_UNSUPPORTED');
    await expect(
      repo.createGroupWithSupervisor(
        { title: 'Unsupported', visibility: 'private' },
        [unsupported.id],
        unsupported.id,
      ),
    ).rejects.toThrow('ORCHESTRATOR_RUNTIME_UNSUPPORTED');
    expect((await repo.findByIdWithAgents(group.id))?.supervisorAgentId).toBe(agent.id);
    expect((await db.select().from(agents).where(eq(agents.id, unsupported.id)))[0]).toEqual(
      unsupported,
    );
  });

  it('does not select an Agent outside the group or an inaccessible member', async () => {
    const { agent, group } = await seed();
    const [privateAgent] = await db
      .insert(agents)
      .values({ title: 'Private', userId: otherId, workspaceId, visibility: 'private' })
      .returning();
    await expect(
      model.updateAgentInGroup(group.id, privateAgent.id, { role: 'supervisor' }),
    ).rejects.toThrow();
    await db
      .insert(chatGroupsAgents)
      .values({ agentId: privateAgent.id, chatGroupId: group.id, userId, workspaceId });
    await expect(
      model.updateAgentInGroup(group.id, privateAgent.id, { role: 'supervisor' }),
    ).rejects.toThrow();
    expect((await repo.findByIdWithAgents(group.id))?.supervisorAgentId).toBe(agent.id);
  });
});
