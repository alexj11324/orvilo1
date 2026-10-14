import type { DeviceListItem } from '@orvilo/types';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useCanEditDevice } from './useCanEditDevice';

vi.mock('@/store/user', () => ({
  useUserStore: (select: (s: unknown) => unknown) => select({ user: { id: 'owner' } }),
}));
vi.mock('@/store/user/selectors', () => ({ userProfileSelectors: { userId: () => 'owner' } }));
describe('device management ownership', () => {
  it('permits only the enrolled owner to edit a registered device', () => {
    const { result } = renderHook(() => useCanEditDevice());
    expect(
      result.current({ registered: true, enroller: { userId: 'owner' } } as DeviceListItem),
    ).toBe(true);
    expect(
      result.current({
        registered: true,
        enroller: { userId: 'another-member' },
      } as DeviceListItem),
    ).toBe(false);
    expect(result.current({ registered: false, enroller: null } as DeviceListItem)).toBe(false);
  });
});
