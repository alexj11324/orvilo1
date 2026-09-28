// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isCaidDispatchAllowed } from './caidAdmission';

const mocks = vi.hoisted(() => ({
  getServerFeatureFlagsFromRuntimeConfig: vi.fn(),
}));

vi.mock('@/server/featureFlags', () => ({
  getServerFeatureFlagsFromRuntimeConfig: mocks.getServerFeatureFlagsFromRuntimeConfig,
}));

const flags = (data: Record<string, unknown>) =>
  mocks.getServerFeatureFlagsFromRuntimeConfig.mockResolvedValue(data);

describe('isCaidDispatchAllowed (R10 — CAID admission rollout gate)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to denied when no flag is configured', async () => {
    flags({});

    await expect(isCaidDispatchAllowed({ userId: 'u1', workspaceId: 'w1' })).resolves.toBe(false);
  });

  it('allows when the deployment flag is true', async () => {
    flags({ caid_dispatch: true });

    await expect(isCaidDispatchAllowed({ userId: 'u1' })).resolves.toBe(true);
  });

  it('allows only allowlisted users when the flag is an id list', async () => {
    flags({ caid_dispatch: ['u1'] });

    await expect(isCaidDispatchAllowed({ userId: 'u1' })).resolves.toBe(true);
    await expect(isCaidDispatchAllowed({ userId: 'u2' })).resolves.toBe(false);
    await expect(isCaidDispatchAllowed({})).resolves.toBe(false);
  });

  it('allows an explicitly authorized workspace even without a user grant', async () => {
    flags({ caid_dispatch: false, caid_dispatch_workspaces: ['w1'] });

    await expect(isCaidDispatchAllowed({ userId: 'u1', workspaceId: 'w1' })).resolves.toBe(true);
    await expect(isCaidDispatchAllowed({ userId: 'u1', workspaceId: 'w2' })).resolves.toBe(false);
    await expect(isCaidDispatchAllowed({ userId: 'u1' })).resolves.toBe(false);
  });

  it('ignores a squashed (non-array) workspace list', async () => {
    // A per-user boolean override can flatten the array flag; the guard must
    // treat it as "no workspaces", not crash.
    flags({ caid_dispatch: false, caid_dispatch_workspaces: true });

    await expect(isCaidDispatchAllowed({ userId: 'u1', workspaceId: 'w1' })).resolves.toBe(false);
  });
});
