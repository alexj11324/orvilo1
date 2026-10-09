import type { DeviceListItem } from '@orvilo/types';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { eligibleExecutionDevices, useExecutionHost } from './useExecutionHost';

const rows = vi.hoisted(() => [
  { deviceId: 'this-mac', registered: true, online: true, scope: 'personal', visibility: null },
  {
    deviceId: 'team-mac',
    registered: true,
    online: true,
    scope: 'workspace',
    visibility: 'public',
  },
  {
    deviceId: 'private-mac',
    registered: true,
    online: true,
    scope: 'workspace',
    visibility: 'private',
  },
  {
    deviceId: 'unshared-mac',
    registered: true,
    online: true,
    scope: 'workspace',
    visibility: null,
  },
  {
    deviceId: 'offline-mac',
    registered: true,
    online: false,
    scope: 'workspace',
    visibility: 'public',
  },
  {
    deviceId: 'ghost-mac',
    registered: false,
    online: true,
    scope: 'workspace',
    visibility: 'public',
  },
]);
const scope = vi.hoisted(() => ({ active: 'workspace' as string | undefined }));
vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => scope.active,
}));
vi.mock('@/features/DeviceManager', () => ({
  useDeviceList: (workspaceId?: string | null) => ({
    data: workspaceId === 'new-workspace' ? [{ ...rows[1], deviceId: 'new-workspace-host' }] : rows,
    mutate: vi.fn(),
  }),
}));
vi.mock('@/services/localExecutionIdentity', () => ({
  resolveLocalExecutionIdentity: async () => ({ localDeviceId: 'this-mac' }),
}));

beforeEach(() => {
  scope.active = 'workspace';
});

describe('creation execution host visibility', () => {
  it('offers public workspace Agents only registered, online, public workspace devices', () => {
    expect(
      eligibleExecutionDevices(rows as DeviceListItem[], 'workspace', 'public').map(
        (device) => device.deviceId,
      ),
    ).toEqual(['team-mac']);
  });
  it('clears the local host when visibility becomes public', async () => {
    const { result, rerender } = renderHook(({ visibility }) => useExecutionHost(visibility), {
      initialProps: { visibility: 'private' as 'private' | 'public' },
    });
    await waitFor(() => expect(result.current.deviceId).toBe('this-mac'));
    rerender({ visibility: 'public' });
    expect(result.current.deviceId).toBe('team-mac');
    expect(result.current.isLocal).toBe(false);
  });
});

it.each(['other-workspace', undefined])(
  'selects a public target-workspace host with active scope %s',
  async (active) => {
    scope.active = active;
    const { result } = renderHook(() => useExecutionHost('public', 'new-workspace'));
    await waitFor(() => expect(result.current.deviceId).toBe('new-workspace-host'));
    expect(result.current.isLocal).toBe(false);
  },
);
it('keeps explicit personal first-Agent creation local even with an active workspace', async () => {
  const { result } = renderHook(() => useExecutionHost('private', null));
  await waitFor(() => expect(result.current.deviceId).toBe('this-mac'));
  expect(result.current.isLocal).toBe(true);
});
