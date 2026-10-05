import type { DeviceListItem } from '@orvilo/types';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFirstAgentDevice } from './useFirstAgentDevice';

const device = (over: Partial<DeviceListItem>): DeviceListItem =>
  ({
    channels: [],
    defaultCwd: null,
    enroller: null,
    friendlyName: null,
    hostname: null,
    identitySource: null,
    lastSeen: '2026-01-01T00:00:00.000Z',
    online: true,
    platform: null,
    registered: true,
    scope: 'personal',
    visibility: null,
    workingDirs: [],
    ...over,
  }) as DeviceListItem;

const mocks = vi.hoisted(() => ({
  devices: undefined as DeviceListItem[] | undefined,
  error: undefined as unknown,
  isValidating: false,
  localDeviceId: undefined as string | undefined,
  persisted: undefined as string | undefined,
  updateOnboarding: vi.fn(),
}));

vi.mock('@/features/DeviceManager', () => ({
  useDeviceList: () => ({
    data: mocks.devices,
    error: mocks.error,
    isValidating: mocks.isValidating,
    mutate: vi.fn(),
  }),
}));

vi.mock('@/services/localExecutionIdentity', () => ({
  resolveLocalExecutionIdentity: vi.fn(async () =>
    mocks.localDeviceId ? { localDeviceId: mocks.localDeviceId } : {},
  ),
}));

vi.mock('@/store/user', () => ({
  useUserStore: Object.assign(
    (selector: (s: { onboarding?: { setup?: { firstAgentDeviceId?: string } } }) => unknown) =>
      selector({ onboarding: { setup: { firstAgentDeviceId: mocks.persisted } } }),
    {
      getState: () => ({
        onboarding: { setup: { firstAgentDeviceId: mocks.persisted } },
        updateOnboarding: mocks.updateOnboarding,
      }),
    },
  ),
}));

beforeEach(() => {
  mocks.devices = undefined;
  mocks.error = undefined;
  mocks.isValidating = false;
  mocks.localDeviceId = undefined;
  mocks.persisted = undefined;
  mocks.updateOnboarding.mockReset().mockResolvedValue(undefined);
});

describe('first-agent device auto-resolution', () => {
  it('prefers this computer on desktop over any other online device', async () => {
    mocks.localDeviceId = 'dev-local';
    mocks.persisted = 'dev-remote';
    mocks.devices = [device({ deviceId: 'dev-remote' }), device({ deviceId: 'dev-local' })];
    const view = renderHook(() => useFirstAgentDevice());
    await waitFor(() => expect(view.result.current.deviceId).toBe('dev-local'));
  });

  it('keeps a persisted pick that is still online when no local device exists', async () => {
    mocks.persisted = 'dev-picked';
    mocks.devices = [device({ deviceId: 'dev-other' }), device({ deviceId: 'dev-picked' })];
    const view = renderHook(() => useFirstAgentDevice());
    await waitFor(() => expect(view.result.current.deviceId).toBe('dev-picked'));
  });

  it('skips a persisted pick that went offline and falls back to the first online device', async () => {
    mocks.persisted = 'dev-offline';
    mocks.devices = [
      device({ deviceId: 'dev-offline', online: false }),
      device({ deviceId: 'dev-online' }),
    ];
    const view = renderHook(() => useFirstAgentDevice());
    await waitFor(() => expect(view.result.current.deviceId).toBe('dev-online'));
  });

  it('ignores workspace-scoped and offline devices when picking the fallback', async () => {
    mocks.devices = [
      device({ deviceId: 'dev-offline', online: false }),
      device({ deviceId: 'dev-workspace', scope: 'workspace' }),
      device({ deviceId: 'dev-personal' }),
    ];
    const view = renderHook(() => useFirstAgentDevice());
    await waitFor(() => expect(view.result.current.deviceId).toBe('dev-personal'));
  });

  it('reports exhausted when nothing online can host the agent', async () => {
    mocks.devices = [device({ deviceId: 'dev-offline', online: false })];
    const view = renderHook(() => useFirstAgentDevice());
    await waitFor(() => expect(view.result.current.exhausted).toBe(true));
    expect(view.result.current.deviceId).toBeUndefined();
  });

  it('checkpoints the resolved id into the onboarding setup record', async () => {
    mocks.devices = [device({ deviceId: 'dev-personal' })];
    renderHook(() => useFirstAgentDevice());
    await waitFor(() =>
      expect(mocks.updateOnboarding).toHaveBeenCalledWith(
        expect.objectContaining({
          setup: expect.objectContaining({ firstAgentDeviceId: 'dev-personal' }),
        }),
      ),
    );
  });

  it('does not write the checkpoint while the inventory is still loading', async () => {
    mocks.devices = undefined;
    renderHook(() => useFirstAgentDevice());
    await Promise.resolve();
    expect(mocks.updateOnboarding).not.toHaveBeenCalled();
  });
});
