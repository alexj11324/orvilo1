import { resolveHeteroAgentSystemContext } from '@orvilo/types';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentScanState } from '@/features/ConnectAgent/useAgentScan';

import CreateAgentPanel from './CreateAgentPanel';
import { RuntimeFields, useAgentRuntimeForm } from './RuntimeFields';

const state = vi.hoisted(() => ({
  builtinOffered: true,
  create: vi.fn(),
  host: { deviceId: 'local-device', isLocal: true, loading: false },
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
vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (store: unknown) => unknown) => selector({ createAgent: vi.fn() }),
}));
vi.mock('@/services/agentOnboarding', () => ({
  createOnboardingAgentOnce: state.create,
  firstPrimeAgentConfig: vi.fn(),
  prepareFirstAgentProvider: vi.fn(),
}));
vi.mock('@/services/device', () => ({ deviceService: { listDevices: vi.fn() } }));
vi.mock('@/services/providerBinding', () => ({
  providerBindingService: { checkConnection: vi.fn() },
}));

beforeEach(() => {
  state.create.mockReset().mockImplementation(async (_checkpoint, params) => ({
    agentId: 'reviewer-1',
    config: params.config,
  }));
  state.builtinOffered = true;
  state.host = { deviceId: 'local-device', isLocal: true, loading: false };
  state.scanState = { agents: { codex: { available: true } }, status: 'success' };
});

describe('shared Agent runtime form', () => {
  it.each(['private', 'public'] as const)(
    'locks creation to the explicit %s visibility',
    async (visibility) => {
      render(
        createElement(CreateAgentPanel, { initialType: 'codex', lockVisibility: true, visibility }),
      );
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'createAgent.create' })).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: 'createAgent.create' }));
      await waitFor(() => expect(state.create).toHaveBeenCalled());
      expect(state.create.mock.calls[0][1].visibility).toBe(visibility);
    },
  );
  it('delivers edited reviewer instructions to the saved CLI runtime', async () => {
    render(createElement(CreateAgentPanel, { initialType: 'codex' }));
    fireEvent.click(screen.getByRole('button', { name: 'createAgent.moreSettings' }));
    fireEvent.click(screen.getByRole('button', { name: 'createAgent.useReviewerStarter' }));
    const instructions = screen.getByRole('textbox', { name: 'createAgent.instructions' });
    fireEvent.change(instructions, { target: { value: 'Review only. Cite file and line.' } });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'createAgent.create' })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'createAgent.create' }));
    await waitFor(() => expect(state.create).toHaveBeenCalled());
    const config = state.create.mock.calls[0][1].config;
    expect(
      resolveHeteroAgentSystemContext(config.agencyConfig.heterogeneousProvider, config.systemRole),
    ).toBe('Review only. Cite file and line.');
  });
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
    act(() => result.current.setModel('gpt-6-astra'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => {
      result.current.setModel('gpt-6-astra');
      result.current.setEffort('max');
    });
    expect(result.current.effort).toBe('max');
    act(() => result.current.setModel('gpt-5.4-mini'));
    expect(result.current.effort).toBe('default');
  });
  it('requires a saved device and model for a public Agent', async () => {
    const { result, rerender } = renderHook(() =>
      useAgentRuntimeForm({ initialType: 'codex', visibility: 'public' }),
    );
    await waitFor(() => expect(state.scan).toHaveBeenCalled());
    act(() => result.current.setModel(''));
    expect(result.current.ready).toBe(false);
    act(() => result.current.setModel('default'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await expect(result.current.prepare()).resolves.toMatchObject({
      model: 'default',
      agencyConfig: { boundDeviceId: 'local-device' },
    });
    act(() => result.current.setModel('gpt-6-astra'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    state.host = { deviceId: undefined as unknown as string, isLocal: true, loading: false };
    rerender();
    expect(result.current.ready).toBe(false);
    await expect(result.current.prepare()).rejects.toThrow('FIRST_AGENT_REQUIRED');
  });
  it('blocks creation while the selected execution host is still resolving', () => {
    state.host = { deviceId: 'local-device', isLocal: true, loading: true };
    const { result } = renderHook(() => useAgentRuntimeForm({ initialType: 'codex' }));
    expect(result.current.ready).toBe(false);
  });
});
