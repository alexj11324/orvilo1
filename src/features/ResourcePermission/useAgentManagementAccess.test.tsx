import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentManagementAccess } from './useAgentManagementAccess';

const testState = vi.hoisted(() => ({
  agent: undefined as
    { visibility?: 'private' | 'public'; workspaceId?: string | null; userId?: string } | undefined,
  activeWorkspace: true,
  currentUserId: 'caller',
  permission: {
    canManageResource: false,
    isAccessResolved: true,
    isLoading: false,
  },
}));

vi.mock('@/business/client/hooks/useHasActiveWorkspace', () => ({
  useHasActiveWorkspace: () => testState.activeWorkspace,
}));
vi.mock('@/store/user', () => ({ useUserStore: () => testState.currentUserId }));
vi.mock('@/helpers/agentManagementAccess', () => ({ rememberAgentManagementAccess: vi.fn() }));
vi.mock('@/features/ResourcePermission/useResourceAccess', () => ({
  useResourceAccess: () => testState.permission,
}));

vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (state: { agentMap: Record<string, unknown> }) => unknown) =>
    selector({ agentMap: testState.agent ? { 'agent-1': testState.agent } : {} }),
}));

vi.mock('@/store/agent/selectors', () => ({
  agentByIdSelectors: {
    getAgentById: (agentId: string) => (state: { agentMap: Record<string, unknown> }) =>
      state.agentMap[agentId],
  },
}));

describe('useAgentManagementAccess', () => {
  beforeEach(() => {
    testState.agent = undefined;
    testState.activeWorkspace = true;
    testState.permission.canManageResource = false;
    testState.permission.isAccessResolved = true;
    testState.permission.isLoading = false;
  });

  it('fails closed while the Agent identity is loading', () => {
    const { result } = renderHook(() => useAgentManagementAccess('agent-1'));

    expect(result.current).toEqual({ canManageAgent: false, isAccessLoading: true });
  });

  it('uses server-confirmed management access for public Workspace Agents', () => {
    testState.agent = { visibility: 'public', workspaceId: 'workspace-1' };
    testState.permission.canManageResource = true;

    const { result } = renderHook(() => useAgentManagementAccess('agent-1'));

    expect(result.current).toEqual({ canManageAgent: true, isAccessLoading: false });
  });

  it('does not treat an ordinary public-resource editor as an Agent manager', () => {
    testState.agent = { visibility: 'public', workspaceId: 'workspace-1' };

    const { result } = renderHook(() => useAgentManagementAccess('agent-1'));

    expect(result.current).toEqual({ canManageAgent: false, isAccessLoading: false });
  });

  it.each(['workspace', 'personal'] as const)(
    'does not infer Manage from a safe nonowner %s Agent identity',
    (scope) => {
      testState.agent = {
        visibility: 'private',
        workspaceId: scope === 'workspace' ? 'workspace-1' : null,
        userId: 'other-owner',
      };
      const { result } = renderHook(() => useAgentManagementAccess('agent-1'));
      expect(result.current.canManageAgent).toBe(false);
    },
  );

  it('keeps personal Agents owner-controlled', () => {
    testState.agent = { visibility: 'private', workspaceId: null, userId: 'caller' };
    const { result } = renderHook(() => useAgentManagementAccess('agent-1'));
    expect(result.current).toEqual({ canManageAgent: true, isAccessLoading: false });
  });

  it('uses actual server management for a private workspace Agent', () => {
    testState.agent = { visibility: 'private', workspaceId: 'workspace-1', userId: 'caller' };
    testState.permission.canManageResource = true;
    const { result } = renderHook(() => useAgentManagementAccess('agent-1'));
    expect(result.current.canManageAgent).toBe(true);
  });

  it('does not inherit personal-mode defaults for a cached foreign workspace identity', () => {
    testState.activeWorkspace = false;
    testState.agent = { visibility: 'public', workspaceId: 'workspace-1', userId: 'other-owner' };
    testState.permission.canManageResource = true;
    const { result } = renderHook(() => useAgentManagementAccess('agent-1'));
    expect(result.current.canManageAgent).toBe(false);
  });
});
