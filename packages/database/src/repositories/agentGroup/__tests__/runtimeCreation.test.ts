// @vitest-environment node
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../../core/getTestDB';
import { AgentModel } from '../../../models/agent';
import { ProjectModel } from '../../../models/project';
import { ProviderBindingModel } from '../../../models/providerBinding';
import { UserModel } from '../../../models/user';
import type { AgentItem } from '../../../schemas';
import {
  agents,
  chatGroups,
  chatGroupsAgents,
  credentials,
  devices,
  projects,
  users,
  workspaces,
} from '../../../schemas';
import { AgentGroupRepository } from '../index';

const db = await getTestDB();
const userId = 'resource-runtime-owner';
const otherUserId = 'resource-runtime-other';
const workspaceId = 'resource-runtime-workspace';
const repo = new AgentGroupRepository(db, userId);
const runtime = {
  agencyConfig: {
    boundDeviceId: 'resource-host',
    executionTarget: 'device',
    heterogeneousProvider: { type: 'orvilo', model: 'resource-model' },
  },
  model: 'resource-model',
  provider: 'openai',
} satisfies Pick<AgentItem, 'agencyConfig' | 'model' | 'provider'>;

beforeEach(async () => {
  await db.delete(projects);
  await db.delete(users);
  await db.insert(users).values([{ id: userId }, { id: otherUserId }]);
});

const seedPrime = async () => {
  await db
    .insert(devices)
    .values({ userId, deviceId: 'resource-host', identitySource: 'fallback' });
  await db.insert(credentials).values({
    id: 'cred_resource',
    ownerUserId: userId,
    key: 'resource',
    name: 'Fixture',
    type: 'kv-env',
    payload: 'fixture-only',
  });
  await new ProviderBindingModel(db, userId).create({
    enabled: true,
    endpoint: 'https://provider.example/v1',
    model: runtime.model,
    name: 'Fixture',
    provider: runtime.provider,
    secretReference: 'credential:cred_resource',
    selection: {
      runtime: 'orvilo',
      engine: 'claude-sdk',
      effort: 'default',
      mode: 'default',
      speed: 'default',
      target: 'sandbox',
    },
  });
  const source = await new AgentModel(db, userId).create({ ...runtime, title: 'Prime' });
  await new UserModel(db, userId).updatePreference({ orchestratorAgentId: source.id });
  return source;
};

/** Legacy fixture: prior versions persisted an owned virtual coordinator. */
const seedLegacyGroup = async (
  params: { title: string },
  memberIds: string[] = [],
  config = runtime,
) => {
  const [coordinator] = await db
    .insert(agents)
    .values({ ...config, userId, virtual: true })
    .returning();
  const [group] = await db
    .insert(chatGroups)
    .values({ ...params, userId })
    .returning();
  await db.insert(chatGroupsAgents).values(
    [coordinator.id, ...memberIds].map((agentId) => ({
      agentId,
      chatGroupId: group.id,
      userId,
      role: agentId === coordinator.id ? 'supervisor' : 'participant',
    })),
  );
  return { group, supervisorAgentId: coordinator.id };
};

describe('resource-owned runtime creation', () => {
  it('preserves runtime on supervisor and owned-member duplicates', async () => {
    await seedPrime();
    const member = await new AgentModel(db, userId).create({
      ...runtime,
      virtual: true,
      title: 'Member',
    });
    const group = await seedLegacyGroup({ title: 'Original' }, [member.id], runtime);
    const duplicate = await repo.duplicate(group.group.id);
    const detail = await repo.findByIdWithAgents(duplicate!.groupId);
    expect(detail?.agents).toHaveLength(2);
    for (const agent of detail!.agents) expect(agent).toMatchObject(runtime);
  });

  it('does not duplicate legacy metadata-only supervisor rows', async () => {
    const [group] = await db.insert(chatGroups).values({ userId, title: 'Legacy' }).returning();
    const [agent] = await db
      .insert(agents)
      .values({ userId, virtual: true, title: 'Legacy supervisor' })
      .returning();
    await db
      .insert(chatGroupsAgents)
      .values({ userId, chatGroupId: group.id, agentId: agent.id, role: 'supervisor' });
    await expect(repo.duplicate(group.id)).rejects.toThrow('AGENT_RUNTIME_REQUIRED');
    expect(await db.select().from(chatGroups)).toHaveLength(1);
  });

  it('rejects a metadata-only owned member even with an admitted supervisor', async () => {
    await seedPrime();
    const [legacy] = await db
      .insert(agents)
      .values({ userId, virtual: true, title: 'Legacy member' })
      .returning();
    const group = await seedLegacyGroup({ title: 'Original' }, [legacy.id], runtime);
    await expect(repo.duplicate(group.group.id)).rejects.toThrow('AGENT_RUNTIME_REQUIRED');
    expect(await db.select().from(chatGroups)).toHaveLength(1);
    expect(await db.select().from(agents)).toHaveLength(3);
  });

  it('requires target-scope host authority for copies and rolls back the group', async () => {
    await seedPrime();
    const group = await seedLegacyGroup({ title: 'Original' }, [], runtime);
    await db
      .insert(workspaces)
      .values({ id: workspaceId, primaryOwnerId: userId, name: 'Target', slug: workspaceId });
    await expect(repo.copyToWorkspace(group.group.id, workspaceId, userId)).rejects.toThrow(
      'AGENT_HOST_UNAVAILABLE',
    );
    expect(await db.select().from(chatGroups)).toHaveLength(1);
  });

  it('leaves owned and referenced members in place when a transfer clone lacks target authority', async () => {
    await seedPrime();
    const member = await new AgentModel(db, userId).create({ ...runtime, title: 'Referenced' });
    const group = await seedLegacyGroup({ title: 'Original' }, [member.id], runtime);
    await db.insert(workspaces).values({
      id: workspaceId,
      primaryOwnerId: userId,
      name: 'Target',
      slug: workspaceId,
    });
    await expect(repo.transferToWorkspace(group.group.id, workspaceId, userId)).rejects.toThrow(
      'AGENT_HOST_UNAVAILABLE',
    );
    const [unchanged] = await db.select().from(chatGroups).where(eq(chatGroups.id, group.group.id));
    expect(unchanged.workspaceId).toBeNull();
    for (const agent of await db.select().from(agents)) expect(agent.workspaceId).toBeNull();
  });

  it('does not repair a legacy group without a runtime', async () => {
    const [group] = await db
      .insert(chatGroups)
      .values({ userId, title: 'Unconfigured' })
      .returning();
    expect((await repo.findByIdWithAgents(group.id))?.supervisorAgentId).toBeUndefined();
    expect(await db.select().from(agents)).toHaveLength(0);
  });

  it('does not fall back to an unguarded default when server provisioning has no snapshot', async () => {
    await seedPrime();
    const [group] = await db
      .insert(chatGroups)
      .values({ userId, title: 'Removed supervisor' })
      .returning();
    expect((await repo.findByIdWithAgents(group.id))?.supervisorAgentId).toBeUndefined();
    expect(await db.select().from(agents)).toHaveLength(1);
  });

  it('creates project coordinators with the actor runtime', async () => {
    await seedPrime();
    const project = await new ProjectModel(db, userId).create({
      identifier: 'RUN',
      name: 'Project',
    });
    const [coordinator] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, project.coordinatorAgentId!));
    expect(coordinator).toMatchObject({ ...runtime, virtual: true });
  });

  it('refuses project creation without an actor Prime and leaves no resource', async () => {
    await expect(
      new ProjectModel(db, userId).create({ identifier: 'RUN', name: 'Project' }),
    ).rejects.toThrow('ORCHESTRATOR_SETUP_REQUIRED');
    expect(await db.select().from(projects)).toHaveLength(0);
    expect(await db.select().from(agents)).toHaveLength(0);
  });
});
