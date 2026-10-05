import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentRuntimeForm } from './RuntimeFields';

const state = vi.hoisted(() => ({
  host: { deviceId: 'local-device', isLocal: true, loading: false },
  scan: vi.fn().mockResolvedValue(undefined),
  reset: vi.fn(),
  scanState: { agents: { codex: { available: true } }, status: 'success' },
}));
vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => undefined,
}));
vi.mock('./useExecutionHost', () => ({ useExecutionHost: () => state.host }));
vi.mock('@/features/ConnectAgent/useAgentScan', () => ({
  useAgentScan: () => ({ scan: state.scan, reset: state.reset, state: state.scanState }),
}));
vi.mock('./useAgentModelOptions', () => ({
  useAgentModelOptions: () => ({ loading: false, options: [], supported: true }),
}));
vi.mock('@/store/providerBinding', () => ({
  useFetchProviderBindings: () => ({ isLoading: false }),
  useProviderBindingStore: (select: (store: { bindings: unknown[] }) => unknown) =>
    select({ bindings: [] }),
}));
vi.mock('@/features/AgentOnboarding/availability', () => ({ isBuiltinAgentUsable: () => false }));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => vi.fn(),
}));
vi.mock('@/services/agentOnboarding', () => ({
  firstPrimeAgentConfig: vi.fn(),
  prepareFirstAgentProvider: vi.fn(),
}));
vi.mock('@/services/device', () => ({ deviceService: { listDevices: vi.fn() } }));
vi.mock('@/services/providerBinding', () => ({
  providerBindingService: { checkConnection: vi.fn() },
}));

beforeEach(() => {
  state.host = { deviceId: 'local-device', isLocal: true, loading: false };
});

describe('shared Agent runtime form', () => {
  it('clears incompatible effort after choosing a different model', async () => {
    const { result } = renderHook(() => useAgentRuntimeForm({ initialType: 'codex' }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => {
      result.current.setModel('gpt-6-astra');
      result.current.setEffort('max');
    });
    expect(result.current.effort).toBe('max');
    act(() => result.current.setModel('gpt-5.4-mini'));
    expect(result.current.effort).toBe('default');
  });
  it('blocks creation while the selected execution host is still resolving', () => {
    state.host = { deviceId: 'local-device', isLocal: true, loading: true };
    const { result } = renderHook(() => useAgentRuntimeForm({ initialType: 'codex' }));
    expect(result.current.ready).toBe(false);
  });
});
