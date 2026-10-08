// @vitest-environment node
import { PROVIDER_CONFIG_ANCHOR_MODEL } from '@orvilo/types';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  agents,
  credentials,
  devices,
  providerBindings,
  users,
  workspaceMembers,
  workspaces,
} from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { AgentModel } from '../agent';
import { UserModel } from '../user';
import { WorkspaceUserSettingsModel } from '../workspaceUserSettings';

const db: OrviloDatabase = await getTestDB();
const userId = 'agent-admission-owner';
const otherUserId = 'agent-admission-other';
const workspaceId = 'agent-admission-workspace';
const model = new AgentModel(db, userId);
const prime = {
  agencyConfig: {
    boundDeviceId: 'saved-host',
    executionTarget: 'device' as const,
    heterogeneousProvider: { model: 'executable-model', type: 'orvilo' as const },
  },
  model: 'executable-model',
  provider: 'openai',
};

beforeEach(async () => {
  await db.delete(users);
  await db.insert(users).values([{ id: userId }, { id: otherUserId }]);
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Admission workspace',
    primaryOwnerId: userId,
    slug: workspaceId,
  });
  await db.insert(workspaceMembers).values({ role: 'owner', userId, workspaceId });
  await db.insert(devices).values([
    { deviceId: 'saved-host', identitySource: 'installation', userId },
    { deviceId: 'other-host', identitySource: 'installation', userId: otherUserId },
    {
      deviceId: 'shared-host',
      identitySource: 'installation',
      userId,
      visibility: 'public',
      workspaceId,
    },
  ]);
  await db.insert(credentials).values({
    id: 'cred_admission',
    key: 'admission-test',
    name: 'Test credential',
    ownerUserId: userId,
    payload: 'encrypted-test-fixture',
    type: 'kv-env',
  });
  await db.insert(providerBindings).values({
    userId,
    config: {
      enabled: true,
      endpoint: 'https://provider.example/v1',
      model: 'executable-model',
      name: 'Fixture Provider',
      provider: 'openai',
      secretReference: 'credential:cred_admission',
      selection: {
        effort: 'default',
        runtime: 'orvilo',
        target: 'sandbox',
        mode: 'default',
        speed: 'default',
      },
    },
  });
});

afterEach(async () => {
  await db.delete(users);
});

describe('Agent creation admission', () => {
  it('requires a configured scope-specific Orchestrator instead of choosing Prime', async () => {
    await model.create({ ...prime, title: 'Prime exists' });
    await expect(
      model.getOrchestratorRuntimeForCreation({ visibility: 'private' }),
    ).rejects.toThrow('ORCHESTRATOR_SETUP_REQUIRED');
  });

  it('keeps personal and workspace/member defaults separate and snapshots only chosen runtime', async () => {
    const source = await model.create({
      agencyConfig: {
        boundDeviceId: 'saved-host',
        executionTarget: 'local',
        localSandbox: true,
        localSandboxNetwork: false,
        workingDirByDevice: { 'saved-host': '/repo/chosen-orchestrator' },
        heterogeneousProvider: {
          command: 'opencode',
          model: 'mimo-free',
          type: 'opencode',
          permission: { configId: 'approval', value: 'ask' },
          systemContext: 'Original source persona',
          env: { PRIVATE_TOKEN: 'fixture-only' },
        },
        enableGraphMode: true,
      },
      title: 'Chosen OpenCode',
    });
    const [original] = await db.select().from(agents).where(eq(agents.id, source.id));
    await new UserModel(db, userId).updatePreference({ orchestratorAgentId: source.id });
    const selected = await model.getOrchestratorRuntimeForCreation({ visibility: 'private' });
    expect(selected.params.orchestratorSourceAgentId).toBe(source.id);
    expect(selected.agencyConfig?.heterogeneousProvider).toMatchObject({
      type: 'opencode',
      model: 'mimo-free',
      permission: { configId: 'approval', value: 'ask' },
    });
    expect(selected.agencyConfig).toMatchObject({
      boundDeviceId: 'saved-host',
      executionTarget: 'local',
      localSandbox: true,
      localSandboxNetwork: false,
      workingDirByDevice: { 'saved-host': '/repo/chosen-orchestrator' },
    });
    expect(selected.agencyConfig?.heterogeneousProvider?.env).toBeUndefined();
    expect(selected.agencyConfig?.heterogeneousProvider?.systemContext).toBeUndefined();
    expect(selected.agencyConfig?.enableGraphMode).toBeUndefined();
    expect((await db.select().from(agents).where(eq(agents.id, source.id)))[0]).toEqual(original);
    const workspaceModel = new AgentModel(db, userId, workspaceId);
    await expect(
      workspaceModel.getOrchestratorRuntimeForCreation({ visibility: 'private' }),
    ).rejects.toThrow('ORCHESTRATOR_SETUP_REQUIRED');
    await new WorkspaceUserSettingsModel(db, userId, workspaceId).updatePreference({
      orchestratorAgentId: source.id,
    });
    await expect(
      workspaceModel.getOrchestratorRuntimeForCreation({ visibility: 'private' }),
    ).rejects.toThrow('ORCHESTRATOR_SCOPE_MISMATCH');
    await expect(
      new AgentModel(db, otherUserId, workspaceId).getOrchestratorRuntimeForCreation({
        visibility: 'private',
      }),
    ).rejects.toThrow('ORCHESTRATOR_SETUP_REQUIRED');
  });

  it('does not publish a private source runtime into a public resource', async () => {
    const [source] = await db
      .insert(agents)
      .values({
        ...prime,
        userId,
        visibility: 'private',
        workspaceId,
      })
      .returning();
    await expect(
      new AgentModel(db, userId, workspaceId).inheritRuntimeForCreation(source.id, {
        purpose: 'orchestrator',
        visibility: 'public',
        deviceId: 'shared-host',
      }),
    ).rejects.toThrow('ORCHESTRATOR_SOURCE_PRIVATE');
  });

  it('rejects unsupported or virtual Orchestrator sources and cross-scope fallback', async () => {
    const unsupported = await model.create({
      agencyConfig: {
        boundDeviceId: 'saved-host',
        executionTarget: 'local',
        heterogeneousProvider: { type: 'pi' },
      },
    });
    await expect(
      model.inheritRuntimeForCreation(unsupported.id, { purpose: 'orchestrator' }),
    ).rejects.toThrow('ORCHESTRATOR_RUNTIME_UNSUPPORTED');
    const virtual = await model.create({ ...prime, virtual: true });
    await expect(
      model.inheritRuntimeForCreation(virtual.id, { purpose: 'orchestrator' }),
    ).rejects.toThrow('ORCHESTRATOR_AGENT_REQUIRED');
    const source = await model.create(prime);
    const workspaceModel = new AgentModel(db, userId, workspaceId);
    await expect(
      workspaceModel.inheritRuntimeForCreation(source.id, {
        purpose: 'orchestrator',
        visibility: 'private',
      }),
    ).rejects.toThrow('ORCHESTRATOR_SCOPE_MISMATCH');
  });

  it.each([{ title: 'Fake Agent' }, { title: 'Fake Agent', avatar: '🤖', virtual: true }])(
    'refuses metadata-only creation before insert: %j',
    async (config) => {
      await expect(model.create(config)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(await db.select().from(agents)).toHaveLength(0);
    },
  );

  it('admits a real Prime model and its registered offline saved host', async () => {
    const agent = await model.create({ ...prime, title: 'My Prime' });
    expect(agent.agencyConfig).toMatchObject(prime.agencyConfig);
    expect(agent.model).toBe('executable-model');
  });

  it('admits a registered imported runtime on a saved local host', async () => {
    const agent = await model.create({
      agencyConfig: {
        boundDeviceId: 'saved-host',
        executionTarget: 'local',
        heterogeneousProvider: { command: 'codex', type: 'codex' },
      },
      title: 'My Codex',
    });
    expect(agent.agencyConfig?.heterogeneousProvider?.type).toBe('codex');
  });

  it('refuses a caller-owned runtime pointing at another user host', async () => {
    await expect(
      model.create({
        ...prime,
        agencyConfig: { ...prime.agencyConfig, boundDeviceId: 'other-host' },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await db.select().from(agents)).toHaveLength(0);
  });

  it.each([undefined, PROVIDER_CONFIG_ANCHOR_MODEL, 'unbound-model'])(
    'refuses missing or non-executable Prime model %s',
    async (selectedModel) => {
      await expect(
        model.create({
          ...prime,
          model: selectedModel,
          agencyConfig: {
            ...prime.agencyConfig,
            heterogeneousProvider: { type: 'orvilo', model: selectedModel },
          },
        }),
      ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
      expect(await db.select().from(agents)).toHaveLength(0);
    },
  );

  it('refuses an entire group batch when a member has no runtime', async () => {
    await expect(
      model.batchCreate([prime, { title: 'Fake group member', virtual: true }]),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(await db.select().from(agents)).toHaveLength(0);
  });

  it('keeps private personal hosts private instead of allowing a shared workspace default', async () => {
    const scoped = new AgentModel(db, userId, workspaceId);
    await expect(scoped.create({ ...prime, visibility: 'public' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(scoped.create({ ...prime, visibility: 'private' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'New workspace Agents must be public',
    });
    expect(await db.select().from(agents)).toHaveLength(0);
  });

  it('refuses legacy metadata-only duplication while leaving existing name edits available', async () => {
    const [legacy] = await db.insert(agents).values({ title: 'Legacy', userId }).returning();
    await model.updateConfig(legacy.id, { name: 'My legacy name' });
    await expect(model.duplicate(legacy.id)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect((await db.select().from(agents).where(eq(agents.id, legacy.id)))[0].name).toBe(
      'My legacy name',
    );
    expect(await db.select().from(agents)).toHaveLength(1);
  });
});
