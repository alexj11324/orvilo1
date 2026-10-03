import { jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bindTopicDeviceAtomically, resolveHeteroExecutionPlan } from './executionAdmission';

const { queryDeviceList, queryPersonal, queryWorkspaceDevices } = vi.hoisted(() => ({
  queryDeviceList: vi.fn(),
  queryPersonal: vi.fn(),
  queryWorkspaceDevices: vi.fn(),
}));

vi.mock('@/database/models/device', () => ({
  DeviceModel: class DeviceModelMock {
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
  queryPersonal.mockReset().mockResolvedValue(deviceRows('dev-a', 'dev-b'));
  queryWorkspaceDevices.mockReset().mockResolvedValue(deviceRows('dev-ws'));
  queryDeviceList.mockReset().mockResolvedValue([]);
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

  it("a pinned session binding survives 'auto' — auto never re-picks a bound conversation", async () => {
    const plan = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      agencyConfig: { executionTarget: 'auto' },
      sessionBoundDeviceId: 'dev-a',
    });

    // The pin is the conversation's device — `auto` cannot steal it.
    expect(plan).toMatchObject({
      deviceId: 'dev-a',
      kind: 'device',
      reason: 'session_bound',
    });
  });

  it('auto + an INVALID session binding blocks for explicit repair — never migrates', async () => {
    const plan = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      agencyConfig: { executionTarget: 'auto' },
      sessionBoundDeviceId: 'dev-gone',
    });

    // The pin is invalid → DEVICE_BINDING_INVALID (repair, not silent re-pick).
    expect(plan.kind).toBe('blocked');
    if (plan.kind === 'blocked') {
      expect(plan.code).toBe('DEVICE_BINDING_INVALID');
      expect(plan.repairCandidates).toEqual(['dev-a', 'dev-b']);
    }
  });

  it('auto + no binding still picks the single legitimate candidate', async () => {
    queryPersonal.mockResolvedValue(deviceRows('dev-only'));

    const plan = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      agencyConfig: { executionTarget: 'auto' },
    });

    expect(plan).toMatchObject({
      deviceId: 'dev-only',
      kind: 'device',
      reason: 'single_candidate',
    });
  });

  it('an UNSET execution target still honors the session pin — admission reaches the resolver', async () => {
    // Regression: an unset `executionTarget` + session pin used to block on
    // EXECUTION_TARGET_NONE before the resolver ever saw the binding — the
    // second message of a bound conversation stranded forever.
    const plan = await resolveHeteroExecutionPlan(db, {
      ...baseParams,
      agencyConfig: {},
      sessionBoundDeviceId: 'dev-a',
    });

    expect(plan).toMatchObject({
      deviceId: 'dev-a',
      kind: 'device',
      reason: 'session_bound',
    });
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
    updateReturning.mockResolvedValue([{ boundDeviceId: 'dev-a' }]);
    const fakeDb = { select, update } as never;

    await expect(
      bindTopicDeviceAtomically(fakeDb, {
        deviceId: 'dev-a',
        topicId: 'topic-1',
        userId: 'user-1',
      }),
    ).resolves.toEqual({ boundDeviceId: 'dev-a', outcome: 'bound' });
    expect(update).toHaveBeenCalledTimes(1);
    // The winner is already known — no re-read.
    expect(select).not.toHaveBeenCalled();
  });

  it('re-reads and returns the winner when the CAS loses', async () => {
    updateReturning.mockResolvedValue([]);
    selectLimit.mockResolvedValue([{ boundDeviceId: 'dev-winner' }]);
    const fakeDb = { select, update } as never;

    await expect(
      bindTopicDeviceAtomically(fakeDb, {
        deviceId: 'dev-a',
        topicId: 'topic-1',
        userId: 'user-1',
      }),
    ).resolves.toEqual({ boundDeviceId: 'dev-winner', outcome: 'occupied' });
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
