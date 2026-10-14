import type { DeviceListItem } from '@orvilo/types';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { eligibleExecutionDevices, useExecutionHost } from './useExecutionHost';

const rows = vi.hoisted(() => [
  { deviceId: 'this-mac', registered: true, online: true },
  { deviceId: 'other-mac', registered: true, online: true },
  { deviceId: 'offline-mac', registered: true, online: false },
  { deviceId: 'ghost-mac', registered: false, online: true },
]);
vi.mock('@/features/DeviceManager', () => ({
  useDeviceList: () => ({ data: rows, mutate: vi.fn() }),
}));
vi.mock('@/services/localExecutionIdentity', () => ({
  resolveLocalExecutionIdentity: async () => ({ localDeviceId: 'this-mac' }),
}));

describe('creation execution host ownership', () => {
  it('offers registered online owned devices for either Agent visibility', () => {
    expect(
      eligibleExecutionDevices(rows as DeviceListItem[]).map((device) => device.deviceId),
    ).toEqual(['this-mac', 'other-mac']);
  });
  it('keeps the owner personal computer available in a workspace', async () => {
    const { result } = renderHook(() => useExecutionHost());
    await waitFor(() => expect(result.current.deviceId).toBe('this-mac'));
    expect(result.current.isLocal).toBe(true);
  });
});
