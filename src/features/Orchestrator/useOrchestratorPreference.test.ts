import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useOrchestratorPreference } from './useOrchestratorPreference';

const state = vi.hoisted(() => ({
  active: null as string | null,
  scoped: { data: undefined as { orchestratorAgentId?: string } | undefined, error: undefined },
  updatePersonal: vi.fn(),
  updateWorkspace: vi.fn(),
}));
vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => state.active,
  getActiveWorkspaceId: () => state.active,
}));
vi.mock('@/store/user', () => ({
  useUserStore: Object.assign(
    (selector: (store: unknown) => unknown) =>
      selector({
        preference: { orchestratorAgentId: 'personal-agent' },
        useFetchWorkspaceUserPreference: () => state.scoped,
      }),
    {
      getState: () => ({
        updatePreference: state.updatePersonal,
        updateWorkspaceUserPreference: state.updateWorkspace,
      }),
    },
  ),
}));

describe('Orchestrator preference scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.active = null;
    state.scoped.data = undefined;
  });
  it('never adopts the personal default while workspace preference is loading or empty', () => {
    state.active = 'workspace-one';
    const { result, rerender } = renderHook(() => useOrchestratorPreference());
    expect(result.current.agentId).toBeUndefined();
    expect(result.current.loading).toBe(true);
    state.scoped.data = {};
    rerender();
    expect(result.current.agentId).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });
  it('writes only the active scope and rejects a stale save after switching', async () => {
    const { result, rerender } = renderHook(() => useOrchestratorPreference());
    expect(result.current.agentId).toBe('personal-agent');
    await result.current.save('new-personal');
    expect(state.updatePersonal).toHaveBeenCalledWith({ orchestratorAgentId: 'new-personal' });
    const staleSave = result.current.save;
    state.active = 'workspace-two';
    state.scoped.data = { orchestratorAgentId: 'workspace-agent' };
    rerender();
    await expect(staleSave('foreign-agent')).rejects.toThrow('ORCHESTRATOR_SCOPE_CHANGED');
    await result.current.save('new-workspace');
    expect(state.updateWorkspace).toHaveBeenCalledWith({ orchestratorAgentId: 'new-workspace' });
    expect(state.updatePersonal).toHaveBeenCalledTimes(1);
  });
});
