import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentScanState } from '@/features/ConnectAgent/useAgentScan';

import { RuntimeFields, useAgentRuntimeForm } from './RuntimeFields';

const state = vi.hoisted(() => ({
  builtinOffered: true,
  host: { deviceId: 'local-device', isLocal: true, loading: false },
  modelOptions: {
    discoveryFailed: false,
    error: undefined as unknown,
    loading: false,
    options: [] as Array<{ label: string; value: string }>,
    supported: true,
  },
  scan: vi.fn().mockResolvedValue(undefined),
  reset: vi.fn(),
  scanState: { agents: { codex: { available: true } }, status: 'success' } as AgentScanState,
}));
vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => undefined,
}));
vi.mock('@/features/HeterogeneousAgent/builtinHarness', () => ({
  useBuiltinHarnessOffered: () => state.builtinOffered,
}));
vi.mock('./useExecutionHost', () => ({ useExecutionHost: () => ({ devices: [], ...state.host }) }));
vi.mock('@/features/ConnectAgent/useAgentScan', () => ({
  useAgentScan: () => ({ scan: state.scan, reset: state.reset, state: state.scanState }),
}));
vi.mock('./useAgentModelOptions', () => ({
  useAgentModelOptions: () => state.modelOptions,
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
  state.builtinOffered = true;
  state.host = { deviceId: 'local-device', isLocal: true, loading: false };
  state.modelOptions = {
    discoveryFailed: false,
    error: undefined,
    loading: false,
    options: [],
    supported: true,
  };
  state.scanState = { agents: { codex: { available: true } }, status: 'success' };
});

describe('shared Agent runtime form', () => {
  it.each([
    ['opencode', 'OpenCode', 'mimo-v2-pro', 'default'],
    ['codex', 'Codex', 'gpt-6-astra', 'max'],
  ] as const)(
    'preserves %s model and effort through real Select reconciliation during host scanning',
    async (type, title, model, effort) => {
      state.scanState = { agents: { [type]: { available: true } }, status: 'success' };
      let form: ReturnType<typeof useAgentRuntimeForm> | undefined;
      const Harness = () => {
        form = useAgentRuntimeForm({});
        return createElement(RuntimeFields, { form });
      };
      const view = render(createElement(Harness));
      fireEvent.click(screen.getByRole('combobox', { name: 'createAgent.step.agent' }));
      const option = await screen.findByRole('option', { name: title });
      fireEvent.pointerDown(option, { pointerType: 'mouse' });
      fireEvent.click(option);
      await waitFor(() => expect(form?.choice).toBe(type));
      act(() => {
        form?.setModel(model);
        form?.setEffort(effort);
      });

      state.host = { deviceId: 'remote-device', isLocal: false, loading: false };
      state.scanState = { agents: null, status: 'scanning' };
      await act(async () => view.rerender(createElement(Harness)));
      expect(form?.choice).toBe(type);
      expect(form?.model).toBe(model);
      expect(form?.effort).toBe(effort);
      expect(form?.ready).toBe(false);
      expect(
        screen.getByRole('combobox', { name: 'createAgent.step.agent' }).textContent,
      ).toContain(title);

      state.scanState = { agents: {}, status: 'success' };
      await act(async () => view.rerender(createElement(Harness)));
      expect(form?.choice).toBe(type);
      expect(form?.model).toBe(model);
      expect(form?.effort).toBe(effort);
      expect(form?.ready).toBe(false);
      expect(screen.getByText('createAgent.selectedUnavailable')).toBeTruthy();
    },
  );
  // The built-in harness used to be the form's starting choice. Withheld, it
  // must be neither preselected nor listed, and the form has to land on a CLI
  // the scan actually found.
  it('offers only installed CLIs and adopts the first one while the built-in harness is withheld', async () => {
    state.builtinOffered = false;
    let form: ReturnType<typeof useAgentRuntimeForm> | undefined;
    const Harness = () => {
      form = useAgentRuntimeForm({});
      return createElement(RuntimeFields, { form });
    };
    render(createElement(Harness));

    await waitFor(() => expect(form?.choice).toBe('codex'));
    fireEvent.click(screen.getByRole('combobox', { name: 'createAgent.step.agent' }));
    expect(await screen.findByRole('option', { name: 'Codex' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Orvilo AI' })).toBeNull();
  });
  it('stays empty and not ready when no CLI is installed and the built-in harness is withheld', async () => {
    state.builtinOffered = false;
    state.scanState = { agents: {}, status: 'success' };
    const { result } = renderHook(() => useAgentRuntimeForm({}));

    await waitFor(() => expect(state.scan).toHaveBeenCalled());
    expect(result.current.choice).toBeUndefined();
    expect(result.current.ready).toBe(false);
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
  it('stays ready when the model catalog is still loading or has failed', async () => {
    state.modelOptions = {
      discoveryFailed: true,
      error: new Error('catalog'),
      loading: true,
      options: [],
      supported: true,
    };
    const { result } = renderHook(() => useAgentRuntimeForm({ initialType: 'codex' }));
    await waitFor(() => expect(result.current.ready).toBe(true));
  });
  it('blocks creation while the selected execution host is still resolving', () => {
    state.host = { deviceId: 'local-device', isLocal: true, loading: true };
    const { result } = renderHook(() => useAgentRuntimeForm({ initialType: 'codex' }));
    expect(result.current.ready).toBe(false);
  });
});
