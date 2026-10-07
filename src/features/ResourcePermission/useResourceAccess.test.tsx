import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResourceGeneralAccess } from '@/services/resourcePermission';

import { useResourceAccess } from './useResourceAccess';

const testState = vi.hoisted(() => ({
  data: undefined as ResourceGeneralAccess | undefined,
  hasActiveWorkspace: true,
}));

vi.mock('@/business/client/hooks/useHasActiveWorkspace', () => ({
  useHasActiveWorkspace: () => testState.hasActiveWorkspace,
}));

vi.mock('@/libs/swr', () => ({
  useClientDataSWR: () => ({
    data: testState.data,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  }),
}));

describe('useResourceAccess', () => {
  beforeEach(() => {
    testState.data = undefined;
    testState.hasActiveWorkspace = true;
  });

  it('uses the server Agent Use capability independently of management and legacy levels', () => {
    testState.data = {
      accessLevel: 'edit',
      canManage: true,
      canUseResource: false,
      creatorId: 'creator',
      generalAccess: 'editor',
      visibility: 'public',
    };
    const { result, rerender } = renderHook(() => useResourceAccess('agent', 'agent-1'));
    expect(result.current.canManageResource).toBe(true);
    expect(result.current.canUseResource).toBe(false);
    testState.data = {
      ...testState.data,
      canManage: false,
      canUseResource: true,
      accessLevel: 'view',
    };
    rerender();
    expect(result.current.canUseResource).toBe(true);
    expect(result.current.canManageResource).toBe(false);
  });

  it('keeps an unresolved Agent Use query read-only', () => {
    const { result } = renderHook(() => useResourceAccess('agent', 'agent-1'));
    expect(result.current.canUseResource).toBe(false);
  });

  it('honors confirmed Agent Use for an author alongside management', () => {
    testState.data = {
      accessLevel: 'view',
      canManage: true,
      canUseResource: true,
      creatorId: 'creator',
      generalAccess: 'viewer',
      visibility: 'public',
    };

    const { result } = renderHook(() => useResourceAccess('agent', 'agent-1'));

    expect(result.current).toMatchObject({
      canEditResource: true,
      canManageResource: true,
      canUseResource: true,
    });
  });

  it('still applies view-only Member Permissions to an ordinary member', () => {
    testState.data = {
      accessLevel: 'view',
      canManage: false,
      canUseResource: false,
      creatorId: 'creator',
      generalAccess: 'viewer',
      visibility: 'public',
    };

    const { result } = renderHook(() => useResourceAccess('agent', 'agent-1'));

    expect(result.current).toMatchObject({
      canEditResource: false,
      canManageResource: false,
      canUseResource: false,
    });
  });
});
