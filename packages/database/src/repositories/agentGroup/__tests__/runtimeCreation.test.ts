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

describe('resource-owned runtime creation', () => {
  it('rejects group creation before writing without an admitted actor Prime', async () => {
    await expect(repo.createGroupWithSupervisor({ title: 'New group' })).rejects.toThrow(
      'ORCHESTRATOR_SETUP_REQUIRED',
    );
    expect(await db.select().from(agents)).toHaveLength(0);
    expect(await db.select().from(chatGroups)).toHaveLength(0);
  });

  it('inherits the actor Prime for group creation and lazy supervisor repair', async () => {
    await seedPrime();
    const created = await repo.createGroupWithSupervisor({ title: 'New group' });
    const [supervisor] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, created.supervisorAgentId));
    expect(supervisor).toMatchObject(runtime);
    const [legacy] = await db
      .insert(chatGroups)
      .values({ userId, title: 'Missing supervisor', visibility: 'private' })
      .returning();
    const repaired = await repo.findByIdWithAgents(legacy.id);
    expect(repaired?.agents[0]).toMatchObject({ ...runtime, visibility: 'private' });
  });

  it('creates an owned ACP coordinator without changing the selected source Agent', async () => {
    await seedPrime();
    const model = new AgentModel(db, userId);
    const config = {
      agencyConfig: {
        boundDeviceId: 'resource-host',
        executionTarget: 'local' as const,
        heterogeneousProvider: {
          command: 'opencode',
          model: 'mimo-free',
          type: 'opencode' as const,
        },
      },
    };
    const source = await model.create({ ...config, title: 'My OpenCode' });
    const [before] = await db.select().from(agents).where(eq(agents.id, source.id));
    const group = await repo.createGroupWithSupervisor(
      { title: 'ACP group', visibility: 'private' },
      [],
      { ...config, params: { orchestratorSourceAgentId: source.id } },
    );
    expect(group.supervisorAgentId).not.toBe(source.id);
    const [supervisor] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, group.supervisorAgentId));
    expect(supervisor.agencyConfig).toMatchObject(config.agencyConfig);
    expect(supervisor.params).toMatchObject({ orchestratorSourceAgentId: source.id });
    expect((await db.select().from(agents).where(eq(agents.id, source.id)))[0]).toEqual(before);
  });

  it('rejects a supplied runtime with an unavailable source before creating resources', async () => {
    await seedPrime();
    await expect(
      repo.createGroupWithSupervisor({ title: 'Forged source' }, [], {
        ...runtime,
        params: { orchestratorSourceAgentId: 'missing-source' },
      }),
    ).rejects.toThrow('Agent not found');
    expect(await db.select().from(chatGroups)).toHaveLength(0);
    expect(await db.select().from(agents)).toHaveLength(1);
  });

  it('preserves a validated selected snapshot including its explicit model override', async () => {
    await seedPrime();
    const source = await new AgentModel(db, userId).create({
      agencyConfig: {
        boundDeviceId: 'resource-host',
        executionTarget: 'local',
        heterogeneousProvider: { type: 'opencode', model: 'source-model' },
      },
    });
    const selected = {
      agencyConfig: {
        boundDeviceId: 'resource-host',
        executionTarget: 'local' as const,
        heterogeneousProvider: { type: 'opencode' as const, model: 'chosen-model' },
      },
      model: 'chosen-model',
      provider: 'chosen-provider',
      params: { orchestratorSourceAgentId: source.id },
    };
    const group = await repo.createGroupWithSupervisor(
      { title: 'Selected snapshot', visibility: 'private' },
      [],
      { params: selected.params },
      selected,
    );
    const [coordinator] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, group.supervisorAgentId));
    expect(coordinator).toMatchObject(selected);
  });

  it('preserves runtime on supervisor and owned-member duplicates', async () => {
    await seedPrime();
    const member = await new AgentModel(db, userId).create({
      ...runtime,
      virtual: true,
      title: 'Member',
    });
    const group = await repo.createGroupWithSupervisor({ title: 'Original' }, [member.id], runtime);
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
    const group = await repo.createGroupWithSupervisor({ title: 'Original' }, [legacy.id], runtime);
    await expect(repo.duplicate(group.group.id)).rejects.toThrow('AGENT_RUNTIME_REQUIRED');
    expect(await db.select().from(chatGroups)).toHaveLength(1);
    expect(await db.select().from(agents)).toHaveLength(3);
  });

  it('requires target-scope host authority for copies and rolls back the group', async () => {
    await seedPrime();
    const group = await repo.createGroupWithSupervisor({ title: 'Original' }, [], runtime);
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
    const group = await repo.createGroupWithSupervisor({ title: 'Original' }, [member.id], runtime);
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
    await expect(repo.findByIdWithAgents(group.id)).rejects.toThrow('ORCHESTRATOR_SETUP_REQUIRED');
    expect(await db.select().from(agents)).toHaveLength(0);
  });

  it('does not fall back to an unguarded default when server provisioning has no snapshot', async () => {
    await seedPrime();
    const [group] = await db
      .insert(chatGroups)
      .values({ userId, title: 'Removed supervisor' })
      .returning();
    await expect(repo.findByIdWithAgents(group.id, undefined, false)).rejects.toThrow(
      'ORCHESTRATOR_SETUP_REQUIRED',
    );
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
