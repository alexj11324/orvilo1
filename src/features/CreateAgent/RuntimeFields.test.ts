import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RuntimeFields, useAgentRuntimeForm } from './RuntimeFields';

const state = vi.hoisted(() => ({
  host: { deviceId: 'local-device', isLocal: true, loading: false },
  scan: vi.fn().mockResolvedValue(undefined),
  reset: vi.fn(),
  scanState: { agents: { codex: { available: true } }, status: 'success' },
}));
vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => undefined,
}));
vi.mock('./useExecutionHost', () => ({ useExecutionHost: () => ({ devices: [], ...state.host }) }));
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) =>
    createElement('button', { onClick: () => onValueChange('remote-device') }, value),
  SelectContent: () => null,
  SelectItem: () => null,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));
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
  state.scanState = { agents: { codex: { available: true } }, status: 'success' };
});

describe('shared Agent runtime form', () => {
  it('preserves the selected harness, model and effort when changing host and blocks an unavailable harness', async () => {
    const { result, rerender } = renderHook(() => useAgentRuntimeForm({ initialType: 'codex' }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => {
      result.current.setModel('gpt-6-astra');
      result.current.setEffort('max');
    });
    const select = vi.fn();
    const view = render(
      createElement(RuntimeFields, {
        form: {
          ...result.current,
          host: { ...result.current.host, select },
        },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'creation.runtime.host' }));
    expect(select).toHaveBeenCalledWith('remote-device');
    expect(result.current.choice).toBe('codex');
    expect(result.current.model).toBe('gpt-6-astra');
    expect(result.current.effort).toBe('max');
    view.unmount();
    state.host = { deviceId: 'remote-device', isLocal: false, loading: false };
    state.scanState = { agents: { codex: { available: false } }, status: 'success' };
    rerender();
    await waitFor(() => expect(state.scan).toHaveBeenCalled());
    expect(result.current.ready).toBe(false);
    expect(result.current.choice).toBe('codex');
  });
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
