// @vitest-environment node
import type { OrviloDatabase } from '@orvilo/database';
import {
  agents,
  chatGroups,
  chatGroupsAgents,
  users,
  workspaceMembers,
  workspaces,
} from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ResourcePermissionModel } from '@/database/models/resourcePermission';

import { agentGroupRouter } from '../../agentGroup';

let testDB: OrviloDatabase;
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: () => testDB }));
const ownerId = 'coord-acl-owner';
const memberId = 'coord-acl-member';
const workspaceId = 'coord-acl-workspace';

beforeEach(async () => {
  testDB = await getTestDB();
  await testDB.delete(users);
  await testDB.insert(users).values([{ id: ownerId }, { id: memberId }]);
  await testDB.insert(workspaces).values({
    id: workspaceId,
    name: 'Coordinator ACL',
    slug: workspaceId,
    primaryOwnerId: ownerId,
  });
  await testDB.insert(workspaceMembers).values([
    { workspaceId, userId: ownerId, role: 'owner' },
    { workspaceId, userId: memberId, role: 'member' },
  ]);
});
afterEach(async () => {
  await testDB.delete(users);
});

it('duplicates a public Group without escalating the shared coordinator Agent use ACL', async () => {
  const [agent] = await testDB
    .insert(agents)
    .values({
      title: 'Shared coordinator',
      userId: ownerId,
      workspaceId,
      visibility: 'public',
      virtual: false,
    })
    .returning();
  const [group] = await testDB
    .insert(chatGroups)
    .values({ title: 'Member Group', userId: memberId, workspaceId, visibility: 'public' })
    .returning();
  await testDB.insert(chatGroupsAgents).values({
    agentId: agent.id,
    chatGroupId: group.id,
    userId: memberId,
    workspaceId,
    role: 'supervisor',
  });
  const permissions = new ResourcePermissionModel(testDB, workspaceId);
  await permissions.setAccessLevel('agent', agent.id, 'use', ownerId);
  const caller = agentGroupRouter.createCaller({
    jwtPayload: { userId: memberId },
    userId: memberId,
    workspaceId,
  });
  const copy = await caller.duplicateGroup({ groupId: group.id });
  expect(copy?.supervisorAgentId).toBe(agent.id);
  expect(await permissions.getAccessLevel('agent', agent.id)).toBe('use');
  expect((await testDB.select().from(agents).where(eq(agents.id, agent.id)))[0]).toEqual(agent);
});

it('duplicates a Group without a coordinator without writing an undefined Agent grant', async () => {
  const [group] = await testDB
    .insert(chatGroups)
    .values({ title: 'Repairable', userId: memberId, workspaceId, visibility: 'public' })
    .returning();
  const caller = agentGroupRouter.createCaller({
    jwtPayload: { userId: memberId },
    userId: memberId,
    workspaceId,
  });
  const copy = await caller.duplicateGroup({ groupId: group.id });
  expect(copy?.supervisorAgentId).toBeUndefined();
  expect(await testDB.select().from(agents)).toHaveLength(0);
});

it('preserves the shared coordinator brand while redacting its configuration', async () => {
  const [agent] = await testDB
    .insert(agents)
    .values({
      title: 'Shared Codex',
      userId: ownerId,
      workspaceId,
      visibility: 'public',
      virtual: false,
      model: 'external-model',
      agencyConfig: {
        heterogeneousProvider: { type: 'codex', args: ['private-runtime-argument'] },
        executionTarget: 'local',
      },
      systemRole: 'private configuration',
    })
    .returning();
  const [group] = await testDB
    .insert(chatGroups)
    .values({ title: 'Member Group', userId: memberId, workspaceId, visibility: 'public' })
    .returning();
  await testDB.insert(chatGroupsAgents).values({
    agentId: agent.id,
    chatGroupId: group.id,
    userId: memberId,
    workspaceId,
    role: 'supervisor',
  });
  await new ResourcePermissionModel(testDB, workspaceId).setAccessLevel(
    'agent',
    agent.id,
    'use',
    ownerId,
  );
  const caller = agentGroupRouter.createCaller({
    jwtPayload: { userId: memberId },
    userId: memberId,
    workspaceId,
  });
  const detail = await caller.getGroupDetail({ id: group.id });
  expect(detail?.agents[0].heterogeneousType).toBe('codex');
  expect(detail?.agents[0].agencyConfig).toEqual({
    executionTarget: 'local',
    heterogeneousProvider: { type: 'codex' },
  });
  expect(detail?.agents[0].systemRole).toBeUndefined();
});
