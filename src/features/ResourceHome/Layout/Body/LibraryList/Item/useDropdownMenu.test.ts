import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useDropdownMenu } from './useDropdownMenu';

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => 'ws-1',
}));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => vi.fn(),
}));

describe('archived library actions', () => {
  it('preserves permission management without offering retired library writes', () => {
    const { result } = renderHook(() =>
      useDropdownMenu({ id: 'kb-1', permissionManageable: true }),
    );
    expect(result.current().map((item) => (item && 'key' in item ? item.key : null))).toEqual([
      'member-permissions',
    ]);
  });
});
