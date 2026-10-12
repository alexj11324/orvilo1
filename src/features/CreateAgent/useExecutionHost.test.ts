import type { DeviceListItem } from '@orvilo/types';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { eligibleExecutionDevices, useExecutionHost } from './useExecutionHost';

const rows = vi.hoisted(() => [
  { deviceId: 'this-mac', registered: true, online: true },
  { deviceId: 'other-mac', registered: true, online: true },
  { deviceId: 'offline', registered: true, online: false },
  { deviceId: 'unregistered', registered: false, online: true },
]);
vi.mock('@/features/DeviceManager', () => ({
  useDeviceList: () => ({ data: rows, mutate: vi.fn() }),
}));
vi.mock('@/services/localExecutionIdentity', () => ({
  resolveLocalExecutionIdentity: async () => ({ localDeviceId: 'this-mac' }),
}));
describe('Agent creation hosts', () => {
  it('offers all registered connected devices without a device visibility dimension', () => {
    expect(eligibleExecutionDevices(rows as DeviceListItem[]).map((row) => row.deviceId)).toEqual([
      'this-mac',
      'other-mac',
    ]);
  });
  it('keeps the selected host across unrelated form rerenders', async () => {
    const { result, rerender } = renderHook(() => useExecutionHost());
    await waitFor(() => expect(result.current.deviceId).toBe('this-mac'));
    act(() => result.current.select('other-mac'));
    rerender();
    expect(result.current.deviceId).toBe('other-mac');
    expect(result.current.isLocal).toBe(false);
  });
});
