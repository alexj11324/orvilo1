// @vitest-environment node
import { getTestDB } from '@orvilo/database/test-utils';
import { isSelectableDevice } from '@orvilo/types';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AgentModelModule from '@/database/models/agent';
import type * as WorkspaceModelModule from '@/database/models/workspace';
import {
  agents,
  resourcePermissions,
  users,
  workspaceMembers,
  workspaces,
} from '@/database/schemas';
import type * as ResourcePermissionModule from '@/server/services/resourcePermission';

import type * as WorkspaceAgentGuardModule from '../_helpers/workspaceAgentGuard';
import { deviceRouter } from '../device';

const mocks = vi.hoisted(() => ({
  getAgentConfig: vi.fn(),
  getExecutionConfig: vi.fn(),
  getMeta: vi.fn(),
  workspaceId: undefined as string | undefined,
  assertUse: vi.fn(),
  queryPersonal: vi.fn(),
  queryWorkspace: vi.fn(),
  membershipRole: vi.fn(),
  queryDeviceList: vi.fn(),
  executeToolCall: vi.fn(),
  persist: vi.fn(),
  canManage: vi.fn(),
  isAuthorOrAdmin: vi.fn(),
  preference: vi.fn(),
  findByDeviceId: vi.fn(),
  findWorkspaceDeviceById: vi.fn(),
}));
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: () => ({}) }));
vi.mock('@/database/models/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkspaceModelModule>()),
  getActiveWorkspaceMembershipRole: mocks.membershipRole,
}));
vi.mock('@/database/models/agent', () => ({
  AgentModel: class {
    getAgentConfigById = mocks.getAgentConfig;
    getAgentConfigForExecution = mocks.getExecutionConfig;
  },
}));
vi.mock('@/database/models/device', () => ({
  WorkspaceDevicePrivateConflictError: class extends Error {},
  DeviceModel: class {
    queryPersonal = mocks.queryPersonal;
    queryWorkspaceDevices = mocks.queryWorkspace;
    updateRuntimeInstallationEvidence = mocks.persist;
    findByDeviceId = mocks.findByDeviceId;
    findWorkspaceDeviceById = mocks.findWorkspaceDeviceById;
  },
}));
vi.mock('@/database/models/workspaceUserSettings', () => ({
  WorkspaceUserSettingsModel: class {
    getPreference = mocks.preference;
  },
}));
vi.mock('@/server/services/resourcePermission', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getResourceMeta: mocks.getMeta,
  canManageResourcePermission: mocks.canManage,
  isResourceAuthorOrAdmin: mocks.isAuthorOrAdmin,
}));
vi.mock('../_helpers/workspaceAgentGuard', () => ({ assertCanUseWorkspaceAgent: mocks.assertUse }));
vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: { queryDeviceList: mocks.queryDeviceList, executeToolCall: mocks.executeToolCall },
  isPathWithinRoot: () => true,
}));
const row = (deviceId: string) => ({
  deviceId,
  userId: 'user-1',
  workspaceId: null,
  lastSeenAt: new Date(),
  capabilitySnapshot: null,
});
const caller = (workspaceId?: string) => {
  mocks.workspaceId = workspaceId;
  return deviceRouter.createCaller({ userId: 'user-1', workspaceId } as never);
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAgentConfig.mockResolvedValue({
    id: 'agent-1',
    userId: 'user-1',
    agencyConfig: { heterogeneousProvider: { type: 'codex', command: 'codex' } },
  });
  mocks.getExecutionConfig.mockImplementation((id) => mocks.getAgentConfig(id));
  mocks.getMeta.mockImplementation(async () => {
    const agent = await mocks.getAgentConfig();
    return agent ? { ...agent, workspaceId: mocks.workspaceId ?? null } : null;
  });
  mocks.assertUse.mockResolvedValue(undefined);
  mocks.canManage.mockResolvedValue(false);
  mocks.isAuthorOrAdmin.mockResolvedValue(false);
  mocks.preference.mockResolvedValue({});
  mocks.queryPersonal.mockResolvedValue([row('host-a'), row('host-b')]);
  mocks.queryWorkspace.mockResolvedValue([]);
  mocks.queryDeviceList.mockResolvedValue([{ deviceId: 'host-a', online: true }]);
  mocks.persist.mockResolvedValue(undefined);
  mocks.findByDeviceId.mockResolvedValue(undefined);
  mocks.findWorkspaceDeviceById.mockResolvedValue(undefined);
  mocks.membershipRole.mockResolvedValue('member');
});

describe('Agent runtime candidate query', () => {
  it.each([
    { userId: 'user-1', workspaceId: 'workspace-1' },
    { userId: 'another-owner', workspaceId: null },
  ])(
    'rejects foreign personal-mode metadata %o before config or device discovery',
    async (meta) => {
      mocks.getMeta.mockResolvedValue(meta);
      await expect(caller().listAgentCandidates({ agentId: 'agent-1' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(mocks.getAgentConfig).not.toHaveBeenCalled();
      expect(mocks.getExecutionConfig).not.toHaveBeenCalled();
      expect(mocks.queryPersonal).not.toHaveBeenCalled();
    },
  );

  it('refuses an inaccessible Agent before querying or scanning devices', async () => {
    mocks.getAgentConfig.mockResolvedValue(null);
    await expect(caller().listAgentCandidates({ agentId: 'missing' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(mocks.queryPersonal).not.toHaveBeenCalled();
    expect(mocks.executeToolCall).not.toHaveBeenCalled();
  });

  it('requires Agent Use authority before any discovery', async () => {
    const { TRPCError } = await import('@trpc/server');
    mocks.assertUse.mockRejectedValue(new TRPCError({ code: 'FORBIDDEN' }));
    await expect(
      caller('workspace-1').listAgentCandidates({ agentId: 'agent-1' }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(mocks.queryPersonal).not.toHaveBeenCalled();
    expect(mocks.executeToolCall).not.toHaveBeenCalled();
  });

  it('allows actual management to read candidates without granting Agent Use', async () => {
    const { TRPCError } = await import('@trpc/server');
    mocks.canManage.mockResolvedValue(true);
    mocks.assertUse.mockRejectedValue(new TRPCError({ code: 'FORBIDDEN' }));
    await expect(
      caller('workspace-1').listAgentCandidates({ agentId: 'agent-1' }),
    ).resolves.toBeDefined();
    expect(mocks.assertUse).not.toHaveBeenCalled();
  });

  it('uses the stored Agent type and command and leaves unknown offline evidence incomplete', async () => {
    mocks.executeToolCall.mockResolvedValue({
      success: true,
      content: JSON.stringify({
        agents: { 'codex': { available: false }, 'claude-code': { available: true } },
      }),
    });
    const inventory = await caller().listAgentCandidates({
      agentId: 'agent-1',
      agentType: 'claude-code',
      command: 'claude',
    } as never);
    expect(inventory.candidates.filter(isSelectableDevice)).toEqual([]);
    expect(inventory.inventoryComplete).toBe(false);
    expect(inventory.candidates[0].capabilityStatus).toBe('incompatible');
    expect(inventory.candidates[1].capabilityStatus).toBe('pending');
  });

  it('persists the existing scanAgents result without inventing missing runtime keys', async () => {
    mocks.findByDeviceId.mockResolvedValue(row('host-a'));
    mocks.executeToolCall.mockResolvedValue({
      success: true,
      content: JSON.stringify({ agents: { codex: { available: true, version: '1.0' } } }),
    });
    expect(await caller().scanAgents({ deviceId: 'host-a' })).toEqual({
      agents: { codex: { available: true, version: '1.0' } },
    });
    expect(mocks.persist.mock.calls[0][1]).toMatchObject({
      codex: { available: true, command: 'codex', observedAt: expect.any(String) },
    });
    expect(mocks.persist.mock.calls[0][1]['claude-code']).toBeUndefined();
  });
});

describe('server-derived Agent candidate scope', () => {
  const installation = {
    installedRuntimes: {
      codex: {
        available: true,
        command: 'codex',
        observedAt: '2026-10-01T00:00:00Z',
      },
    },
  };
  beforeEach(() => {
    mocks.getAgentConfig.mockResolvedValue({
      id: 'agent-1',
      userId: 'another-author',
      visibility: 'public',
      workspaceId: 'workspace-1',
      agencyConfig: { heterogeneousProvider: { type: 'codex', command: 'codex' } },
    });
    mocks.queryWorkspace.mockResolvedValue([
      { ...row('shared'), workspaceId: 'workspace-1', capabilitySnapshot: installation },
    ]);
    mocks.queryPersonal.mockResolvedValue([
      { ...row('personal'), capabilitySnapshot: installation },
    ]);
    mocks.queryDeviceList.mockResolvedValue([]);
  });

  it('includes owned personal and authorized shared installed runtimes for nonfixed member choice', async () => {
    const inventory = await caller('workspace-1').listAgentCandidates({ agentId: 'agent-1' });
    expect(inventory.inventoryComplete).toBe(true);
    expect(
      inventory.candidates.filter(isSelectableDevice).map((candidate) => candidate.deviceId),
    ).toEqual(['shared', 'personal']);
  });

  it('probes shared installed runtimes as the actual caller, not the enroller or Agent creator', async () => {
    mocks.queryWorkspace.mockResolvedValue([
      {
        ...row('shared'),
        userId: 'enroller',
        workspaceId: 'workspace-1',
        capabilitySnapshot: installation,
      },
    ]);
    mocks.queryPersonal.mockResolvedValue([]);
    mocks.queryDeviceList.mockResolvedValue([{ deviceId: 'shared', online: true }]);
    mocks.executeToolCall.mockResolvedValue({
      success: true,
      content: JSON.stringify({ agents: { codex: { available: true } } }),
    });
    const inventory = await caller('workspace-1').listAgentCandidates({ agentId: 'agent-1' });
    expect(inventory.candidates.filter(isSelectableDevice).map(({ deviceId }) => deviceId)).toEqual(
      ['shared'],
    );
    expect(mocks.executeToolCall.mock.calls[0][0].userId).toBe('user-1');
  });
  it.each([false, true])(
    'gives authorized public Agent callers the same own-personal pool regardless of Manage=%s',
    async (canManage) => {
      mocks.canManage.mockResolvedValue(canManage);
      mocks.isAuthorOrAdmin.mockResolvedValue(canManage);
      const inventory = await caller('workspace-1').listAgentCandidates({
        agentId: 'agent-1',
        canSelectPersonalDevice: true,
        includeCallerPersonalDevices: true,
      } as never);
      expect(
        inventory.candidates.filter(isSelectableDevice).map((candidate) => candidate.deviceId),
      ).toEqual(['shared', 'personal']);
    },
  );

  it('does not let a stale personal preference bypass a fixed member policy', async () => {
    mocks.getAgentConfig.mockResolvedValue({
      id: 'agent-1',
      userId: 'another-author',
      visibility: 'public',
      workspaceId: 'workspace-1',
      agencyConfig: {
        executionTarget: 'device',
        executionTargetSelectionPolicy: 'fixed',
        boundDeviceId: 'shared',
        heterogeneousProvider: { type: 'codex', command: 'codex' },
      },
    });
    mocks.preference.mockResolvedValue({
      agentDeviceOverrides: {
        'agent-1': { executionTarget: 'device', boundDeviceId: 'personal' },
      },
    });
    const inventory = await caller('workspace-1').listAgentCandidates({ agentId: 'agent-1' });
    expect(
      inventory.candidates.filter(isSelectableDevice).map((candidate) => candidate.deviceId),
    ).toEqual(['shared']);
    expect(mocks.queryPersonal).not.toHaveBeenCalled();
  });
});

describe('selected legacy private Agent visibility-aware model boundary', () => {
  it('resolves installed candidates for an authorized noncreator without making private config readable', async () => {
    const db = await getTestDB();
    const { AgentModel } =
      await vi.importActual<typeof AgentModelModule>('@/database/models/agent');
    const { getResourceMeta } = await vi.importActual<typeof ResourcePermissionModule>(
      '@/server/services/resourcePermission',
    );
    const { assertCanUseWorkspaceAgent } = await vi.importActual<typeof WorkspaceAgentGuardModule>(
      '../_helpers/workspaceAgentGuard',
    );
    const owner = 'device-private-inventory-owner';
    const workspaceId = 'device-private-inventory-workspace';
    await db
      .insert(users)
      .values([{ id: owner }, { id: 'user-1' }])
      .onConflictDoNothing();
    try {
      await db
        .insert(workspaces)
        .values({ id: workspaceId, name: 'Inventory', slug: workspaceId, primaryOwnerId: owner });
      await db.insert(workspaceMembers).values({ userId: 'user-1', workspaceId, role: 'member' });
      const [agent] = await db
        .insert(agents)
        .values({
          userId: owner,
          workspaceId,
          visibility: 'private',
          systemRole: 'Private instructions',
          agencyConfig: { heterogeneousProvider: { type: 'codex', command: 'codex' } },
        })
        .returning();
      await db.insert(resourcePermissions).values({
        accessLevel: 'use',
        createdBy: owner,
        resourceId: agent.id,
        resourceType: 'agent',
        userId: 'user-1',
        workspaceId,
      });
      const model = new AgentModel(db, 'user-1', workspaceId);
      expect(await model.getAgentConfigById(agent.id)).toBeNull();
      mocks.getAgentConfig.mockImplementation(model.getAgentConfigById);
      mocks.getExecutionConfig.mockImplementation(model.getAgentConfigForExecution);
      mocks.getMeta.mockImplementation((_db, type, id) => getResourceMeta(db, type, id));
      mocks.assertUse.mockImplementation((params) => assertCanUseWorkspaceAgent({ ...params, db }));
      mocks.queryPersonal.mockResolvedValue([]);
      mocks.queryWorkspace.mockResolvedValue([
        {
          ...row('private-agent-host'),
          workspaceId,
          capabilitySnapshot: {
            installedRuntimes: {
              codex: {
                available: true,
                command: 'codex',
                observedAt: '2026-10-01T00:00:00Z',
              },
            },
          },
        },
      ]);
      mocks.queryDeviceList.mockResolvedValue([]);
      const inventory = await caller(workspaceId).listAgentCandidates({ agentId: agent.id });
      expect(
        inventory.candidates.filter(isSelectableDevice).map(({ deviceId }) => deviceId),
      ).toEqual(['private-agent-host']);
      expect(mocks.assertUse).toHaveBeenCalled();
      expect(await model.getAgentConfigById(agent.id)).toBeNull();
      expect(JSON.stringify(inventory)).not.toContain('Private instructions');
      mocks.membershipRole.mockResolvedValue('viewer');
      await expect(
        caller(workspaceId).listAgentCandidates({ agentId: agent.id }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      mocks.membershipRole.mockResolvedValue('member');
      await db.delete(resourcePermissions).where(eq(resourcePermissions.resourceId, agent.id));
      await expect(
        caller(workspaceId).listAgentCandidates({ agentId: agent.id }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        caller('foreign-workspace').listAgentCandidates({ agentId: agent.id }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(users).where(eq(users.id, owner));
    }
  });
});
