import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePermission } from './usePermission';

const state = vi.hoisted(() => ({
  error: undefined as Error | undefined,
  id: 'workspace' as string | null,
  role: 'member' as string | null,
}));
vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => state.id,
}));
vi.mock('@/business/client/hooks/useFetchWorkspaces', () => ({
  useFetchWorkspaces: () => ({
    data: state.role ? [{ id: state.id, role: state.role }] : undefined,
    error: state.error,
    isLoading: !state.role,
  }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('workspace UI permission ceiling', () => {
  beforeEach(() => {
    state.id = 'workspace';
    state.role = 'member';
    state.error = undefined;
  });
  it.each(['viewer', null, 'unknown-role'])('denies writes for %s membership', (role) => {
    state.role = role;
    expect(renderHook(() => usePermission('create_content')).result.current.allowed).toBe(false);
    expect(renderHook(() => usePermission('edit_own_content')).result.current.allowed).toBe(false);
  });
  it('permits member collaboration without granting workspace governance', () => {
    expect(renderHook(() => usePermission('create_content')).result.current.allowed).toBe(true);
    expect(renderHook(() => usePermission('edit_own_content')).result.current.allowed).toBe(true);
    expect(renderHook(() => usePermission('manage_settings')).result.current.allowed).toBe(false);
    expect(renderHook(() => usePermission('edit_others_content')).result.current.allowed).toBe(
      false,
    );
  });
  it('keeps billing at the Owner ceiling and rejects unknown actions', () => {
    state.role = 'admin';
    expect(renderHook(() => usePermission('manage_settings')).result.current.allowed).toBe(true);
    expect(renderHook(() => usePermission('view_billing')).result.current.allowed).toBe(false);
    state.role = 'owner';
    expect(renderHook(() => usePermission('view_billing')).result.current.allowed).toBe(true);
    expect(renderHook(() => usePermission('unknown_action')).result.current.allowed).toBe(false);
  });
  it('preserves personal-mode access without workspace membership', () => {
    state.id = null;
    state.role = null;
    expect(renderHook(() => usePermission('create_content')).result.current.allowed).toBe(true);
  });
  it('denies a stale writable membership after its refresh fails', () => {
    state.error = new Error('Membership refresh failed');
    expect(renderHook(() => usePermission('create_content')).result.current.allowed).toBe(false);
  });
});
