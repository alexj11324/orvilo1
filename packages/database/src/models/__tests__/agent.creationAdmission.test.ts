// @vitest-environment node
import { PROVIDER_CONFIG_ANCHOR_MODEL } from '@orvilo/types';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { agents, credentials, devices, providerBindings, users, workspaces } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { AgentModel } from '../agent';

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
      provider: 'openai',
      secretReference: 'credential:cred_admission',
      selection: { runtime: 'orvilo', target: 'sandbox', mode: 'default', speed: 'default' },
    },
  });
});

afterEach(async () => {
  await db.delete(users);
});

describe('Agent creation admission', () => {
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
    const privateAgent = await scoped.create({ ...prime, visibility: 'private' });
    expect(privateAgent.agencyConfig?.boundDeviceId).toBe('saved-host');
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
