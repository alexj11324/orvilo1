// @vitest-environment node
import type { OrviloDatabase } from '@orvilo/database';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AgentModel } from '@/database/models/agent';
import { WorkspaceUserSettingsModel } from '@/database/models/workspaceUserSettings';
import {
  agents,
  devices,
  users,
  workspaceMembers,
  workspaces,
  workspaceUserSettings,
} from '@/database/schemas';
import type { AgentConfigWithId } from '@/server/services/agent';
import { resolveHeteroExecutionPlan } from '@/server/services/deviceGateway/executionAdmission';

import { resolveRunAgentConfig } from '../pipeline/resolveRunAgentConfig';

vi.mock('@/database/models/user', () => ({
  UserModel: { getInfoForAIGeneration: vi.fn().mockResolvedValue({}) },
}));
vi.mock('@/server/services/resourcePermission', () => ({
  isResourceAuthorOrAdmin: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/server/services/deviceGateway/index', () => ({
  deviceGateway: { queryDeviceList: vi.fn().mockResolvedValue([]) },
}));

let db: OrviloDatabase;
const workspaceId = 'ws-saved-runtime';
const owner = 'saved-runtime-owner';
const member = 'saved-runtime-member';
const agentId = 'agt-saved-runtime';
const savedDevice = 'saved-device';
const nextDevice = 'next-saved-device';
const config = {
  boundDeviceId: savedDevice,
  executionTarget: 'device' as const,
  heterogeneousProvider: { type: 'codex' as const, model: 'gpt-5.2' },
};

beforeAll(async () => {
  db = await getTestDB();
  await db
    .insert(users)
    .values([{ id: owner }, { id: member }])
    .onConflictDoNothing();
  await db
    .insert(workspaces)
    .values({ id: workspaceId, name: 'Saved runtime', slug: workspaceId, primaryOwnerId: owner });
  await db.insert(workspaceMembers).values([
    { userId: owner, workspaceId, role: 'owner' },
    { userId: member, workspaceId, role: 'member' },
  ]);
  await db.insert(devices).values(
    [savedDevice, nextDevice].map((deviceId) => ({
      deviceId,
      userId: owner,
      workspaceId,
      visibility: 'public' as const,
      identitySource: 'machine-id' as const,
    })),
  );
  await db.insert(agents).values({
    id: agentId,
    userId: owner,
    workspaceId,
    visibility: 'public',
    agencyConfig: config,
    model: 'gpt-5.2',
    provider: 'codex',
    systemRole: '',
  });
  for (const userId of [owner, member]) {
    // Raw obsolete keys intentionally bypass the current preference schema.
    await db.insert(workspaceUserSettings).values({
      userId,
      workspaceId,
      preference: {
        agentModeOverrides: { [agentId]: true },
        agentDeviceOverrides: {
          [agentId]: { boundDeviceId: `old-${userId}`, executionTarget: 'local' },
        },
        agentModelOverrides: { [agentId]: { model: `old-${userId}`, provider: 'old-provider' } },
      },
    });
  }
});

const resolveFor = async (userId: string) =>
  resolveRunAgentConfig(
    {
      db,
      userId,
      workspaceId,
      resolveAgentConfigOrThrow: async () => {
        const row = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
        return {
          ...row,
          plugins: [],
          chatConfig: row?.chatConfig ?? {},
        } as unknown as AgentConfigWithId;
      },
    },
    { identifier: agentId, throwIfExecutionAborted: async () => {} },
  );

const planFor = (userId: string, agencyConfig: typeof config) =>
  resolveHeteroExecutionPlan(db, {
    agencyConfig,
    agentOwnerId: owner,
    canUseDevice: true,
    isPlatformTask: false,
    sandboxExecutionAvailable: false,
    userId,
    workspaceId,
    workspaceScoped: true,
    // Both hints disagree with the saved Agent. Neither is a selection.
    explicitDeviceId: nextDevice,
    sessionBoundDeviceId: nextDevice,
    localDeviceId: nextDevice,
  });

describe('saved Agent runtime with real workspace member rows', () => {
  it('uses the same model and device for both members, ignoring their obsolete stored choices', async () => {
    for (const userId of [owner, member]) {
      const result = await resolveFor(userId);
      expect(result.agentConfig).toMatchObject({
        model: 'gpt-5.2',
        provider: 'codex',
        agencyConfig: config,
      });
      expect(await planFor(userId, result.agentConfig.agencyConfig as typeof config)).toMatchObject(
        { kind: 'device', deviceId: savedDevice },
      );
    }
  });

  it('saves routing once on the Agent and applies it to the next run for every member', async () => {
    await new AgentModel(db, owner, workspaceId).updateConfig(agentId, {
      agencyConfig: { boundDeviceId: nextDevice },
    });
    for (const userId of [owner, member]) {
      const result = await resolveFor(userId);
      expect(await planFor(userId, result.agentConfig.agencyConfig as typeof config)).toMatchObject(
        { kind: 'device', deviceId: nextDevice },
      );
    }
  });

  it('duplicates the saved runtime and lets the copy select another device independently', async () => {
    const model = new AgentModel(db, owner, workspaceId);
    const copy = await model.duplicate(agentId);
    expect(copy?.agentId).toBeTruthy();
    await model.updateConfig(copy!.agentId, { agencyConfig: { boundDeviceId: savedDevice } });
    expect(
      (await db.query.agents.findFirst({ where: eq(agents.id, copy!.agentId) }))?.agencyConfig
        ?.boundDeviceId,
    ).toBe(savedDevice);
    expect(
      (await db.query.agents.findFirst({ where: eq(agents.id, agentId) }))?.agencyConfig
        ?.boundDeviceId,
    ).toBe(nextDevice);
  });

  it('rejects creating or saving an Agent without either required choice', async () => {
    const model = new AgentModel(db, owner, workspaceId);
    await expect(
      model.create({
        agencyConfig: { heterogeneousProvider: { type: 'codex', model: 'gpt-5.2' } },
      }),
    ).rejects.toThrow('AGENT_HOST_REQUIRED');
    await expect(
      model.create({
        agencyConfig: {
          boundDeviceId: savedDevice,
          executionTarget: 'device',
          heterogeneousProvider: { type: 'codex' },
        },
      }),
    ).rejects.toThrow('AGENT_MODEL_REQUIRED');
    await expect(
      model.updateConfig(agentId, { agencyConfig: { boundDeviceId: '' } }),
    ).rejects.toThrow('AGENT_HOST_REQUIRED');
    await expect(
      model.updateConfig(agentId, {
        agencyConfig: { heterogeneousProvider: { model: '' } },
        model: '',
      }),
    ).rejects.toThrow('AGENT_MODEL_REQUIRED');
  });

  it('allows the private workspace first Agent to keep its creator-owned personal device', async () => {
    const personalDeviceId = 'private-first-agent-device';
    await db
      .insert(devices)
      .values({ deviceId: personalDeviceId, userId: owner, identitySource: 'machine-id' });
    await db.insert(agents).values({
      id: 'agt-private-first',
      userId: owner,
      workspaceId,
      visibility: 'private',
      model: 'gpt-5.2',
      agencyConfig: { ...config, boundDeviceId: personalDeviceId },
    });
    await new AgentModel(db, owner, workspaceId).updateConfig('agt-private-first', {
      agencyConfig: { boundDeviceId: personalDeviceId },
    });
    expect(
      (await db.query.agents.findFirst({ where: eq(agents.id, 'agt-private-first') }))?.agencyConfig
        ?.boundDeviceId,
    ).toBe(personalDeviceId);
  });

  it('stores only the remaining preference fields and retains member mode', async () => {
    const model = new WorkspaceUserSettingsModel(db, member, workspaceId);
    await model.updatePreference({ agentModeOverrides: { [agentId]: false } });
    expect((await model.get())?.preference).toEqual({ agentModeOverrides: { [agentId]: false } });
  });
});
