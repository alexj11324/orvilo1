import { isRunnableDevice, isSelectableDevice } from '@orvilo/types';
import { jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bindTopicDeviceAtomically,
  listAuthorizedDeviceCandidates,
  resolveHeteroExecutionPlan,
  satisfiesMinAdapterVersion,
} from './executionAdmission';
import { getScopedOnlineDevices } from './scopedDevices';

const {
  queryDeviceList,
  queryPersonal,
  queryWorkspaceDevices,
  findByDeviceId,
  findWorkspaceDeviceById,
  updateCapabilityEvidence,
  updateRuntimeInstallationEvidence,
  executeToolCall,
} = vi.hoisted(() => ({
  findByDeviceId: vi.fn(),
  findWorkspaceDeviceById: vi.fn(),
  queryDeviceList: vi.fn(),
  queryPersonal: vi.fn(),
  queryWorkspaceDevices: vi.fn(),
  updateCapabilityEvidence: vi.fn(),
  updateRuntimeInstallationEvidence: vi.fn(),
  executeToolCall: vi.fn(),
}));

vi.mock('@/database/models/device', () => ({
  DeviceModel: class DeviceModelMock {
    findByDeviceId: typeof findByDeviceId;
    constructor(_db: unknown, userId: string) {
      this.findByDeviceId = (
        userId === 'agent-creator'
          ? vi.fn().mockResolvedValue({ deviceId: 'creator-private', userId, workspaceId: null })
          : findByDeviceId
      ) as typeof findByDeviceId;
    }
    findWorkspaceDeviceById = findWorkspaceDeviceById;
    queryPersonal = queryPersonal;
    queryWorkspaceDevices = queryWorkspaceDevices;
    updateCapabilityEvidence = updateCapabilityEvidence;
    updateRuntimeInstallationEvidence = updateRuntimeInstallationEvidence;
  },
}));

vi.mock('@/database/schemas', () => ({
  topics: pgTable('topics', {
    id: text('id'),
    metadata: jsonb('metadata'),
    userId: text('user_id'),
    workspaceId: text('workspace_id'),
  }),
}));

vi.mock('./index', () => ({
  deviceGateway: { queryDeviceList, executeToolCall },
}));

const db = {} as never;

const deviceRows = (...ids: string[]) =>
  ids.map((deviceId) => ({
    deviceId,
    friendlyName: null,
    hostname: `${deviceId}.local`,
    lastSeenAt: new Date('2026-01-01T00:00:00.000Z'),
    platform: 'darwin',
    userId: 'user-1',
    workspaceId: null,
  }));

const onlineAttachments = (...ids: string[]) =>
  ids.map((deviceId) => ({
    channels: [],
    deviceId,
    hostname: `${deviceId}.local`,
    lastSeen: '2026-01-02T00:00:00.000Z',
    online: true,
    platform: 'darwin',
    scope: 'personal',
  }));

const baseParams = {
  canUseDevice: true,
  isPlatformTask: false,
  sandboxExecutionAvailable: false,
  userId: 'user-1',
  workspaceScoped: false,
};

beforeEach(() => {
  findByDeviceId.mockReset().mockResolvedValue(undefined);
  findWorkspaceDeviceById.mockReset().mockResolvedValue(undefined);
  queryPersonal.mockReset().mockResolvedValue(deviceRows('dev-a', 'dev-b'));
  queryWorkspaceDevices.mockReset().mockResolvedValue(deviceRows('dev-ws'));
  queryDeviceList.mockReset().mockResolvedValue([]);
  findByDeviceId.mockReset().mockResolvedValue(undefined);
  findWorkspaceDeviceById.mockReset().mockResolvedValue(undefined);
  updateCapabilityEvidence.mockReset().mockResolvedValue(undefined);
  updateRuntimeInstallationEvidence.mockReset().mockResolvedValue(undefined);
  executeToolCall.mockReset().mockResolvedValue({ success: false, error: 'Device disconnected' });
});

describe('listAuthorizedDeviceCandidates', () => {
  it('never treats an Agent creator binding as authority over their personal machine', async () => {
    queryWorkspaceDevices.mockResolvedValue([]);
    const inventory = await listAuthorizedDeviceCandidates(db, 'user-1', 'ws-1', {
      agentOwnerId: 'agent-creator',
      referencedDevices: [{ deviceId: 'creator-private', ownerRegistry: true }],
    });
    expect(inventory.candidates).toEqual([]);
    expect(queryDeviceList.mock.calls.every(([actor]) => actor === 'user-1')).toBe(true);
  });
  it('uses personal gateway presence for an authorized personal binding in a workspace run', async () => {
    queryWorkspaceDevices.mockResolvedValue([]);
    findByDeviceId.mockResolvedValue({
      deviceId: 'dev-personal',
      userId: 'user-1',
      workspaceId: null,
    });
    queryDeviceList.mockImplementation(async (_userId, workspaceId) =>
      workspaceId ? [] : [{ deviceId: 'dev-personal', authenticated: true }],
    );

    const inventory = await listAuthorizedDeviceCandidates(db, 'user-1', 'ws-1', {
      referencedDevices: [{ deviceId: 'dev-personal' }],
    });

    expect(inventory).toMatchObject({
      candidates: [{ deviceId: 'dev-personal', online: true, scopeOk: true }],
      inventoryComplete: true,
    });
  });

  it('keeps workspace devices offline when only the personal pool has the same device id', async () => {
    queryWorkspaceDevices.mockResolvedValue(deviceRows('dev-ws'));
    queryDeviceList.mockImplementation(async (_userId, workspaceId) =>
      workspaceId ? [] : [{ deviceId: 'dev-ws', authenticated: true }],
    );

    const inventory = await listAuthorizedDeviceCandidates(db, 'user-1', 'ws-1', {
      referencedDevices: [{ deviceId: 'dev-ws' }],
    });

    expect(inventory.candidates).toMatchObject([{ deviceId: 'dev-ws', online: false }]);
  });

  it('does not authorize an unregistered personal reference through gateway presence', async () => {
    queryWorkspaceDevices.mockResolvedValue([]);
    queryDeviceList.mockImplementation(async (_userId, workspaceId) =>
      workspaceId ? [] : [{ deviceId: 'dev-personal', authenticated: true }],
    );

    const inventory = await listAuthorizedDeviceCandidates(db, 'user-1', 'ws-1', {
      referencedDevices: [{ deviceId: 'dev-personal' }],
    });

    expect(inventory).toMatchObject({ candidates: [], inventoryComplete: true });
  });
});

describe('bindTopicDeviceAtomically (conditional first-bind CAS)', () => {
  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const selectLimit = vi.fn();
  const selectWhere = vi.fn(() => ({ limit: selectLimit }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));

  beforeEach(() => {
    updateReturning.mockReset();
    updateWhere.mockClear();
    updateSet.mockClear();
    update.mockClear();
    selectLimit.mockReset();
    selectWhere.mockClear();
    selectFrom.mockClear();
    select.mockClear();
  });

  it('returns the binding it installed when the CAS write wins', async () => {
    updateReturning.mockResolvedValue([{ bindingRevision: 1, boundDeviceId: 'dev-a' }]);
    const fakeDb = { select, update } as never;

    await expect(
      bindTopicDeviceAtomically(fakeDb, {
        deviceId: 'dev-a',
        topicId: 'topic-1',
        userId: 'user-1',
      }),
    ).resolves.toEqual({ bindingRevision: 1, boundDeviceId: 'dev-a', outcome: 'bound' });
    expect(update).toHaveBeenCalledTimes(1);
    // The winner is already known — no re-read.
    expect(select).not.toHaveBeenCalled();
  });

  it('re-reads and returns the winner when the CAS loses', async () => {
    updateReturning.mockResolvedValue([]);
    selectLimit.mockResolvedValue([{ bindingRevision: 2, boundDeviceId: 'dev-winner' }]);
    const fakeDb = { select, update } as never;

    await expect(
      bindTopicDeviceAtomically(fakeDb, {
        deviceId: 'dev-a',
        topicId: 'topic-1',
        userId: 'user-1',
      }),
    ).resolves.toEqual({ bindingRevision: 2, boundDeviceId: 'dev-winner', outcome: 'occupied' });
  });

  it('throws when the CAS loses and no binding can be read — never guesses', async () => {
    updateReturning.mockResolvedValue([]);
    selectLimit.mockResolvedValue([]);
    const fakeDb = { select, update } as never;

    await expect(
      bindTopicDeviceAtomically(fakeDb, {
        deviceId: 'dev-a',
        topicId: 'topic-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow(/no binding persisted/);
  });

  it('throws when the write fails — persistence failure is an admission failure', async () => {
    updateReturning.mockRejectedValue(new Error('deadlock'));
    const fakeDb = { select, update } as never;

    await expect(
      bindTopicDeviceAtomically(fakeDb, {
        deviceId: 'dev-a',
        topicId: 'topic-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow('deadlock');
  });
});

describe('listAuthorizedDeviceCandidates (F06 — capability/version never assumed)', () => {
  it('settings/picker and admission return the IDENTICAL candidate id set — personal + workspace', async () => {
    // Personal scope: registry rows + one gateway-transient device.
    queryPersonal.mockResolvedValue(deviceRows('dev-a', 'dev-b'));
    queryDeviceList.mockResolvedValue(onlineAttachments('dev-a', 'dev-transient'));

    const picker = await getScopedOnlineDevices(db, 'user-1', undefined);
    const inventory = await listAuthorizedDeviceCandidates(db, 'user-1', undefined);

    expect(new Set(inventory.candidates.map((c) => c.deviceId))).toEqual(
      new Set(picker.map((d) => d.deviceId)),
    );

    // Workspace scope: shared + caller-enrolled rows are one membership rule.
    queryWorkspaceDevices.mockResolvedValue(deviceRows('dev-ws-shared', 'dev-ws-mine'));
    queryDeviceList.mockResolvedValue(onlineAttachments('dev-ws-shared', 'dev-ws-ghost'));

    const wsPicker = await getScopedOnlineDevices(db, 'user-1', 'ws-1');
    const wsInventory = await listAuthorizedDeviceCandidates(db, 'user-1', 'ws-1');

    // The gateway-only 'dev-ws-ghost' is excluded by BOTH surfaces — a
    // workspace row IS the authorization, presence is not membership.
    expect(new Set(wsInventory.candidates.map((c) => c.deviceId))).toEqual(
      new Set(wsPicker.map((d) => d.deviceId)),
    );
    expect(wsInventory.candidates.map((c) => c.deviceId)).toEqual(
      expect.arrayContaining(['dev-ws-shared', 'dev-ws-mine']),
    );
    expect(wsInventory.candidates.some((c) => c.deviceId === 'dev-ws-ghost')).toBe(false);
  });

  it('a view-only grant never enters execution candidates — registry, transient or referenced', async () => {
    queryPersonal.mockResolvedValue(deviceRows('dev-a', 'dev-view'));
    queryDeviceList.mockResolvedValue(onlineAttachments('dev-a', 'dev-view-transient'));
    findByDeviceId.mockResolvedValue(deviceRows('dev-view-ref')[0]);

    const inventory = await listAuthorizedDeviceCandidates(db, 'user-1', undefined, {
      policy: {
        devicePermissions: {
          'dev-view': 'view',
          'dev-view-ref': 'view',
          'dev-view-transient': 'view',
        },
      },
      referencedDevices: [{ deviceId: 'dev-view-ref' }],
    });

    expect(inventory.candidates.map((c) => c.deviceId)).toEqual(['dev-a']);
    expect(inventory.candidates.every((c) => c.permission === 'execute')).toBe(true);
  });

  it('a device that lacks the required tool is incompatible — never selectable, never runnable', async () => {
    queryDeviceList.mockResolvedValue(onlineAttachments('dev-a', 'dev-b'));

    const inventory = await listAuthorizedDeviceCandidates(db, 'user-1', undefined, {
      probeSystemInfo: async (deviceId) =>
        deviceId === 'dev-a'
          ? { supportedTools: ['mcp.call', 'files.read'] }
          : { supportedTools: ['files.read'] },
      requiredOperation: { kind: 'device-tool-call', toolName: 'mcp.call' },
    });

    const capable = inventory.candidates.find((c) => c.deviceId === 'dev-a')!;
    const incapable = inventory.candidates.find((c) => c.deviceId === 'dev-b')!;

    expect(capable).toMatchObject({
      capabilityOk: true,
      capabilityStatus: 'verified',
      verification: { mode: 'live-probe' },
    });
    expect(isRunnableDevice(capable)).toBe(true);

    expect(incapable).toMatchObject({
      capabilityOk: false,
      capabilityStatus: 'incompatible',
    });
    expect(isSelectableDevice(incapable)).toBe(false);
    expect(isRunnableDevice(incapable)).toBe(false);
  });

  it('an unknown capability is pending verification — never recorded true, never runnable', async () => {
    queryDeviceList.mockResolvedValue(onlineAttachments('dev-b'));

    const inventory = await listAuthorizedDeviceCandidates(db, 'user-1', undefined, {
      // Older client: answers the probe but advertises no supportedTools.
      probeSystemInfo: async () => ({ arch: 'arm64' }) as never,
      requiredOperation: { kind: 'device-operation', operation: 'filesystem.write' },
    });

    const candidate = inventory.candidates.find((c) => c.deviceId === 'dev-b')!;
    expect(candidate.capabilityStatus).toBe('pending');
    expect(candidate.capabilityOk).toBe(false);
    expect(candidate.versionOk).toBe(false);
    expect(isSelectableDevice(candidate)).toBe(false);
    expect(isRunnableDevice(candidate)).toBe(false);
  });

  it('agent-run verifies via the registry contract; an explicit minAdapterVersion stays pending', async () => {
    const defaultOp = await listAuthorizedDeviceCandidates(db, 'user-1', undefined);
    expect(
      defaultOp.candidates.every(
        (c) => c.capabilityStatus === 'verified' && c.verification?.delegated === true,
      ),
    ).toBe(true);

    const versioned = await listAuthorizedDeviceCandidates(db, 'user-1', undefined, {
      requiredOperation: { adapter: 'claude-code', kind: 'agent-run', minAdapterVersion: '2.0.0' },
    });
    for (const candidate of versioned.candidates) {
      expect(candidate.versionStatus).toBe('pending');
      expect(candidate.versionOk).toBe(false);
      expect(isSelectableDevice(candidate)).toBe(false);
      expect(isRunnableDevice(candidate)).toBe(false);
    }
  });

  it('online only gates runnable — an offline verified device stays selectable', async () => {
    queryDeviceList.mockResolvedValue(onlineAttachments('dev-a'));

    const inventory = await listAuthorizedDeviceCandidates(db, 'user-1', undefined);
    const offline = inventory.candidates.find((c) => c.deviceId === 'dev-b')!;

    expect(offline.online).toBe(false);
    expect(isSelectableDevice(offline)).toBe(true);
    expect(isRunnableDevice(offline)).toBe(false);
  });

  it('permissions-unready, query-failed, empty and complete stay distinguishable', async () => {
    const unready = await listAuthorizedDeviceCandidates(db, 'user-1', undefined, {
      policy: { permissionsReady: false },
    });
    expect(unready).toEqual({
      candidates: [],
      inventoryComplete: false,
      inventoryState: 'permissions-unready',
    });

    queryPersonal.mockRejectedValue(new Error('db down'));
    const failed = await listAuthorizedDeviceCandidates(db, 'user-1', undefined);
    expect(failed.inventoryState).toBe('query-failed');
    expect(failed.inventoryComplete).toBe(false);

    queryPersonal.mockResolvedValue([]);
    const empty = await listAuthorizedDeviceCandidates(db, 'user-1', undefined);
    expect(empty).toEqual({
      candidates: [],
      inventoryComplete: true,
      inventoryState: 'empty',
    });

    queryPersonal.mockResolvedValue(deviceRows('dev-a'));
    const complete = await listAuthorizedDeviceCandidates(db, 'user-1', undefined);
    expect(complete.inventoryState).toBe('complete');
  });

  it('a referenced device verified in a registry joins; an unverifiable reference stays out', async () => {
    findByDeviceId.mockImplementation(async (deviceId: string) =>
      deviceId === 'dev-ref' ? deviceRows('dev-ref')[0] : undefined,
    );

    const inventory = await listAuthorizedDeviceCandidates(db, 'user-1', undefined, {
      referencedDevices: [{ deviceId: 'dev-ref' }, { deviceId: 'dev-phantom' }],
    });

    const referenced = inventory.candidates.find((c) => c.deviceId === 'dev-ref')!;
    expect(referenced.scopeSource).toBe('referenced');
    expect(referenced.owner).toEqual({ userId: 'user-1', workspaceId: null });
    expect(inventory.candidates.some((c) => c.deviceId === 'dev-phantom')).toBe(false);
  });

  it('a resolved plan carries the verified registry-delegated candidate — never a fabricated row', async () => {
    const plan = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      agencyConfig: { boundDeviceId: 'dev-a', executionTarget: 'device' },
    });

    expect(plan.kind).toBe('device');
    if (plan.kind === 'device') {
      expect(plan.candidate.deviceId).toBe('dev-a');
      expect(plan.candidate.capabilityStatus).toBe('verified');
      expect(plan.candidate.verification).toMatchObject({
        delegated: true,
        mode: 'registry',
      });
    }
  });

  it('an explicit request for a device that cannot prove the operation is blocked — never dispatched', async () => {
    const plan = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      explicitDeviceId: 'dev-a',
      requiredOperation: { kind: 'device-tool-call', toolName: 'mcp.call' },
    });

    // capabilityStatus stays 'pending' under a failed/absent probe → the
    // candidate is not selectable → the request resolves to a block, not a run.
    expect(plan.kind).toBe('blocked');
  });
});

describe('satisfiesMinAdapterVersion', () => {
  it.each([
    ['2.0.0', '2.0.0', true],
    ['2.1.0', '2.0.0', true],
    ['2.0.1', '2.0.0', true],
    ['3.0.0', '2.9.9', true],
    ['1.9.9', '2.0.0', false],
    ['2.0.0', '2.0.1', false],
    // Partial versions parse as their prefix — x.y.z tuple, missing = 0.
    ['2', '1.9', true],
    ['2.1', '2.0.5', true],
    // Unparseable input never satisfies — honest pending beats a coerced verdict.
    ['dev', '1.0.0', false],
    ['2.0.0', 'not-a-version', false],
    ['', '1.0.0', false],
  ])('%s satisfies %s → %s', (current, min, expected) => {
    expect(satisfiesMinAdapterVersion(current, min)).toBe(expected);
  });
});

describe('registry capability evidence (F06 — snapshots feed the verdict, never fabricate)', () => {
  it('a fresh stored adapterVersion proves minAdapterVersion — stale or absent stays pending', async () => {
    const evidenceRows = [
      {
        ...deviceRows('dev-fresh')[0],
        adapterVersion: '2.1.0',
        lastVerifiedAt: new Date(),
      },
      {
        ...deviceRows('dev-stale')[0],
        adapterVersion: '2.1.0',
        // Beyond the 7-day TTL — a device not heard from cannot vouch for itself.
        lastVerifiedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
      { ...deviceRows('dev-blank')[0] },
    ];
    queryPersonal.mockResolvedValue(evidenceRows);

    const inventory = await listAuthorizedDeviceCandidates(db, 'user-1', undefined, {
      requiredOperation: { adapter: 'claude-code', kind: 'agent-run', minAdapterVersion: '2.0.0' },
    });

    const fresh = inventory.candidates.find((c) => c.deviceId === 'dev-fresh')!;
    expect(fresh).toMatchObject({
      capabilityStatus: 'verified',
      versionOk: true,
      versionStatus: 'verified',
    });
    expect(fresh.verification).toMatchObject({ source: 'registry:adapterVersion' });

    for (const id of ['dev-stale', 'dev-blank']) {
      const candidate = inventory.candidates.find((c) => c.deviceId === id)!;
      expect(candidate.versionStatus).toBe('pending');
      expect(candidate.versionOk).toBe(false);
      expect(isSelectableDevice(candidate)).toBe(false);
    }
  });

  it('a stored adapterVersion below the requirement stays pending — never coerced', async () => {
    queryPersonal.mockResolvedValue([
      {
        ...deviceRows('dev-old')[0],
        adapterVersion: '1.5.0',
        lastVerifiedAt: new Date(),
      },
    ]);

    const inventory = await listAuthorizedDeviceCandidates(db, 'user-1', undefined, {
      requiredOperation: { adapter: 'claude-code', kind: 'agent-run', minAdapterVersion: '2.0.0' },
    });

    const candidate = inventory.candidates.find((c) => c.deviceId === 'dev-old')!;
    expect(candidate.versionStatus).toBe('pending');
    expect(candidate.versionOk).toBe(false);
  });

  it('a fresh capabilitySnapshot answers a device-tool-call when the device cannot be probed', async () => {
    // dev-a is OFFLINE (no gateway presence) so the live probe never reaches it —
    // but its registry row carries a snapshot from a verified session.
    queryPersonal.mockResolvedValue([
      {
        ...deviceRows('dev-a')[0],
        capabilitySnapshot: { supportedTools: ['mcp.call', 'files.read'] },
        lastVerifiedAt: new Date(),
      },
      {
        ...deviceRows('dev-b')[0],
        capabilitySnapshot: { supportedTools: ['files.read'] },
        lastVerifiedAt: new Date(),
      },
    ]);
    queryDeviceList.mockResolvedValue([]);

    const inventory = await listAuthorizedDeviceCandidates(db, 'user-1', undefined, {
      // The probe answers nothing — the snapshot is the only evidence.
      probeSystemInfo: async () => undefined,
      requiredOperation: { kind: 'device-tool-call', toolName: 'mcp.call' },
    });

    const capable = inventory.candidates.find((c) => c.deviceId === 'dev-a')!;
    expect(capable).toMatchObject({
      capabilityOk: true,
      capabilityStatus: 'verified',
      verification: { mode: 'registry', source: 'registry:snapshot' },
    });

    const incapable = inventory.candidates.find((c) => c.deviceId === 'dev-b')!;
    expect(incapable.capabilityStatus).toBe('incompatible');
    expect(isSelectableDevice(incapable)).toBe(false);
  });

  it('a stale snapshot is treated as absent — pending, never verified', async () => {
    queryPersonal.mockResolvedValue([
      {
        ...deviceRows('dev-a')[0],
        capabilitySnapshot: { supportedTools: ['mcp.call'] },
        lastVerifiedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    ]);

    const inventory = await listAuthorizedDeviceCandidates(db, 'user-1', undefined, {
      probeSystemInfo: async () => undefined,
      requiredOperation: { kind: 'device-tool-call', toolName: 'mcp.call' },
    });

    const candidate = inventory.candidates.find((c) => c.deviceId === 'dev-a')!;
    expect(candidate.capabilityStatus).toBe('pending');
    expect(candidate.capabilityOk).toBe(false);
  });

  it('a successful live probe refreshes the stored snapshot for later offline verdicts', async () => {
    queryDeviceList.mockResolvedValue(onlineAttachments('dev-a'));

    await listAuthorizedDeviceCandidates(db, 'user-1', undefined, {
      probeSystemInfo: async () => ({ supportedTools: ['mcp.call'] }),
      requiredOperation: { kind: 'device-tool-call', toolName: 'mcp.call' },
    });

    // The registry write is fire-and-forget — settle the microtask before
    // asserting so a slow event loop cannot hide the call.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(updateCapabilityEvidence).toHaveBeenCalledWith('dev-a', {
      supportedTools: ['mcp.call'],
    });
  });
});
