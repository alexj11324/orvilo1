import { jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bindTopicDeviceIfUnset,
  listAuthorizedDeviceCandidates,
  resolveHeteroExecutionPlan,
} from './executionAdmission';

const {
  findByDeviceId,
  findWorkspaceDeviceById,
  queryDeviceList,
  queryPersonal,
  queryWorkspaceDevices,
} = vi.hoisted(() => ({
  findByDeviceId: vi.fn(),
  findWorkspaceDeviceById: vi.fn(),
  queryDeviceList: vi.fn(),
  queryPersonal: vi.fn(),
  queryWorkspaceDevices: vi.fn(),
}));

vi.mock('@/database/models/device', () => ({
  DeviceModel: class DeviceModelMock {
    findByDeviceId = findByDeviceId;
    findWorkspaceDeviceById = findWorkspaceDeviceById;
    queryPersonal = queryPersonal;
    queryWorkspaceDevices = queryWorkspaceDevices;
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
  deviceGateway: { queryDeviceList },
}));

const db = {} as never;

const deviceRows = (...ids: string[]) => ids.map((deviceId) => ({ deviceId }));

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
});

describe('listAuthorizedDeviceCandidates', () => {
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
});

describe('resolveHeteroExecutionPlan', () => {
  it('resolves a valid session binding first, even when the device is offline', async () => {
    const plan = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      agencyConfig: { executionTarget: 'device', boundDeviceId: 'dev-b' },
      sessionBoundDeviceId: 'dev-a',
    });

    expect(plan).toMatchObject({
      deviceId: 'dev-a',
      kind: 'device',
      reason: 'session_bound',
    });
  });

  it('blocks with DEVICE_BINDING_INVALID on a revoked binding even when another device is legal (repair ≠ resume)', async () => {
    queryPersonal.mockResolvedValue(deviceRows('dev-b'));

    const plan = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      agencyConfig: { executionTarget: 'device', boundDeviceId: 'dev-b' },
      sessionBoundDeviceId: 'dev-gone',
    });

    expect(plan.kind).toBe('blocked');
    if (plan.kind === 'blocked') {
      expect(plan.code).toBe('DEVICE_BINDING_INVALID');
      expect(plan.repairCandidates).toEqual(['dev-b']);
    }
  });

  it('rejects an explicit request for a device outside the authorized set — never silently defaulting', async () => {
    const plan = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      explicitDeviceId: 'dev-c',
    });

    expect(plan).toMatchObject({ code: 'DEVICE_REQUEST_UNAUTHORIZED', kind: 'blocked' });
  });

  it('resolves an explicit request inside the authorized set', async () => {
    const plan = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      explicitDeviceId: 'dev-b',
    });

    expect(plan).toMatchObject({
      deviceId: 'dev-b',
      kind: 'device',
      reason: 'explicit_request',
    });
  });

  it('lets the pinned policy beat the member preference AND the explicit request', async () => {
    const plan = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      agencyConfig: {
        boundDeviceId: 'dev-a',
        executionTarget: 'device',
        executionTargetSelectionPolicy: 'fixed',
      },
      explicitDeviceId: 'dev-b',
      memberDeviceOverride: { boundDeviceId: 'dev-b', executionTarget: 'device' },
    });

    // Preference is suppressed under a pinned policy; the agent default wins.
    expect(plan).toMatchObject({
      deviceId: 'dev-a',
      kind: 'device',
      reason: 'agent_default',
    });
  });

  it('blocks on an incomplete inventory — never judged as 0/1, never auto-binds', async () => {
    queryPersonal.mockRejectedValue(new Error('db down'));

    const plan = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      agencyConfig: { executionTarget: 'device', boundDeviceId: 'dev-a' },
      sessionBoundDeviceId: 'dev-a',
    });

    expect(plan).toMatchObject({ code: 'DEVICE_INVENTORY_INCOMPLETE', kind: 'blocked' });
  });

  it('auto-resolves the single legitimate candidate for a never-bound principal (conditional first-bind input)', async () => {
    queryPersonal.mockResolvedValue(deviceRows('dev-only'));

    const plan = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      agencyConfig: {},
    });

    expect(plan).toMatchObject({
      deviceId: 'dev-only',
      kind: 'device',
      reason: 'single_candidate',
    });
  });

  it("a member's `local` override shadows the shared default — no fallthrough to the shared binding", async () => {
    // Member picked 'local' on a workspace agent but is not on a desktop →
    // no localDeviceId → the shared `device` binding must NOT rescue them.
    queryWorkspaceDevices.mockResolvedValue(deviceRows('dev-ws', 'dev-ws2'));
    const plan = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      // merged view: member's override already applied to executionTarget
      agencyConfig: { boundDeviceId: 'dev-ws', executionTarget: 'local' },
      memberDeviceOverride: { executionTarget: 'local' },
      workspaceId: 'ws-1',
    });

    expect(plan).toMatchObject({ code: 'DEVICE_SELECTION_REQUIRED', kind: 'blocked' });
  });

  it("a member's `local` override resolves the caller's own workspace-enrolled device", async () => {
    queryWorkspaceDevices.mockResolvedValue(deviceRows('dev-ws', 'dev-ws2'));
    const plan = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      agencyConfig: { boundDeviceId: 'dev-ws', executionTarget: 'local' },
      // The member's own desktop enrolled into the workspace is a legal
      // preference device.
      localDeviceId: 'dev-ws2',
      memberDeviceOverride: { executionTarget: 'local' },
      workspaceId: 'ws-1',
    });

    expect(plan).toMatchObject({
      deviceId: 'dev-ws2',
      kind: 'device',
      reason: 'user_agent_preference',
    });
  });

  it('stored `none` is an explicit opt-out — EXECUTION_TARGET_NONE without consulting candidates', async () => {
    const plan = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      agencyConfig: { executionTarget: 'none' },
      localDeviceId: 'dev-a',
    });

    expect(plan).toMatchObject({ code: 'EXECUTION_TARGET_NONE', kind: 'blocked' });
    expect(queryPersonal).not.toHaveBeenCalled();
  });

  it('returns the sandbox plan for a supported sandbox target without touching the device inventory', async () => {
    const plan = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      agencyConfig: { executionTarget: 'sandbox' },
      sandboxExecutionAvailable: true,
    });

    expect(plan).toEqual({ kind: 'sandbox' });
    expect(queryPersonal).not.toHaveBeenCalled();
  });

  it('denies senders without device access — degrades to sandbox only when one exists', async () => {
    const denied = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      canUseDevice: false,
    });
    expect(denied).toMatchObject({ code: 'DEVICE_ACCESS_DENIED', kind: 'blocked' });

    const sandboxed = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      canUseDevice: false,
      sandboxExecutionAvailable: true,
    });
    expect(sandboxed).toEqual({ kind: 'sandbox' });
  });

  it("`local` resolves the requester's own device via the agent default; boundDeviceId stands in off-desktop", async () => {
    const local = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      agencyConfig: { boundDeviceId: 'dev-b', executionTarget: 'local' },
      localDeviceId: 'dev-a',
    });
    expect(local).toMatchObject({ deviceId: 'dev-a', kind: 'device' });

    const offDesktop = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      agencyConfig: { boundDeviceId: 'dev-b', executionTarget: 'local' },
    });
    expect(offDesktop).toMatchObject({ deviceId: 'dev-b', kind: 'device' });
  });

  it('workspace scope reads only workspace devices; an explicit personal device is unauthorized', async () => {
    queryWorkspaceDevices.mockResolvedValue(deviceRows('dev-ws'));

    const plan = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      agencyConfig: { executionTarget: 'device' },
      // 'dev-a' is a personal device — outside the workspace candidate set.
      explicitDeviceId: 'dev-a',
      workspaceId: 'ws-1',
    });

    expect(plan).toMatchObject({ code: 'DEVICE_REQUEST_UNAUTHORIZED', kind: 'blocked' });
    expect(queryWorkspaceDevices).toHaveBeenCalled();
    expect(queryPersonal).not.toHaveBeenCalled();
  });

  it("a pinned session binding survives 'auto' suppression — auto re-picks from candidates", async () => {
    const plan = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      agencyConfig: { executionTarget: 'auto' },
      sessionBoundDeviceId: 'dev-gone',
    });

    // auto ignores the stale pin → two candidates → selection required.
    expect(plan).toMatchObject({ code: 'DEVICE_SELECTION_REQUIRED', kind: 'blocked' });
  });
});

describe('bindTopicDeviceIfUnset (conditional first-bind CAS)', () => {
  const updateWhere = vi.fn();
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  beforeEach(() => {
    updateWhere.mockReset();
    updateSet.mockClear();
    update.mockClear();
  });

  it('returns true when the CAS write installs the binding', async () => {
    updateWhere.mockReturnValue({ returning: vi.fn(async () => [{ id: 'topic-1' }]) });
    const fakeDb = { update } as never;

    await expect(
      bindTopicDeviceIfUnset(fakeDb, { deviceId: 'dev-a', topicId: 'topic-1', userId: 'user-1' }),
    ).resolves.toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('returns false when an existing binding wins the race', async () => {
    updateWhere.mockReturnValue({ returning: vi.fn(async () => []) });
    const fakeDb = { update } as never;

    await expect(
      bindTopicDeviceIfUnset(fakeDb, { deviceId: 'dev-a', topicId: 'topic-1', userId: 'user-1' }),
    ).resolves.toBe(false);
  });

  it('returns false instead of throwing when the write fails (audit write, not the gate)', async () => {
    updateWhere.mockReturnValue({
      returning: vi.fn(async () => {
        throw new Error('deadlock');
      }),
    });
    const fakeDb = { update } as never;

    await expect(
      bindTopicDeviceIfUnset(fakeDb, { deviceId: 'dev-a', topicId: 'topic-1', userId: 'user-1' }),
    ).resolves.toBe(false);
  });
});
