import type { DeviceListItem } from '@orvilo/types';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentScanState } from '@/features/ConnectAgent/useAgentScan';
import type { CreateAgentParams } from '@/services/agent';
import { deviceService } from '@/services/device';

import CreateAgentPanel from './CreateAgentPanel';
import { RuntimeFields, useAgentRuntimeForm } from './RuntimeFields';
import type * as ExecutionHostModule from './useExecutionHost';

const state = vi.hoisted(() => ({
  host: { deviceId: 'local-device', isLocal: true, loading: false } as {
    deviceId: string;
    isLocal: boolean;
    loading: boolean;
    device?: DeviceListItem;
  },
  create: vi.fn(),
  scan: vi.fn().mockResolvedValue(undefined),
  reset: vi.fn(),
  scanState: { agents: { codex: { available: true } }, status: 'success' } as AgentScanState,
}));
vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => undefined,
}));
vi.mock('./useExecutionHost', async (importOriginal) => ({
  ...(await importOriginal<typeof ExecutionHostModule>()),
  useExecutionHost: () => ({
    devices: state.host.device ? [state.host.device] : [],
    ...state.host,
  }),
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
vi.mock('@/store/agent', () => ({
  useAgentStore: (select: (store: { createAgent: typeof state.create }) => unknown) =>
    select({ createAgent: state.create }),
}));
vi.mock('@/services/agentOnboarding', () => ({
  createOnboardingAgentOnce: async (
    _checkpoint: unknown,
    params: CreateAgentParams,
    create: typeof state.create,
  ) => create(params),
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

it('creates a locked public source in the new workspace using its public device', async () => {
  const device = {
    channels: [],
    deviceId: 'public-device',
    registered: true,
    online: true,
    scope: 'workspace',
    visibility: 'public',
  } as DeviceListItem;
  state.host = { deviceId: device.deviceId, isLocal: false, loading: false, device };
  vi.mocked(deviceService.listDevices).mockImplementation(async (scope) =>
    scope === 'new-workspace' ? [device] : [],
  );
  state.create.mockImplementation(async (params) => ({
    agentId: `${params.workspaceId}/${params.visibility}`,
  }));
  const onCreated = vi.fn();
  render(
    createElement(CreateAgentPanel, {
      lockVisibility: true,
      visibility: 'public',
      workspaceId: 'new-workspace',
      initialType: 'codex',
      onCreated,
    }),
  );
  const create = screen.getByText('createAgent.create').closest('button')!;
  await waitFor(() => expect(create.disabled).toBe(false));
  fireEvent.submit(create.closest('form')!);
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-workspace/public', undefined));
});

it.each([
  ['private', 'public'],
  ['public', 'private'],
] as const)(
  'updates a locked %s destination to %s without losing the draft',
  async (initial, next) => {
    const device = {
      channels: [],
      deviceId: 'public-device',
      registered: true,
      online: true,
      scope: 'workspace',
      visibility: 'public',
    } as DeviceListItem;
    state.host = { deviceId: device.deviceId, isLocal: false, loading: false, device };
    vi.mocked(deviceService.listDevices).mockResolvedValue([device]);
    state.create.mockImplementation(async (params) => ({
      agentId: `${params.config.name}/${params.visibility}`,
    }));
    const onCreated = vi.fn();
    const checkpoint = { requestId: 'retained-create-intent' };
    const props = {
      lockVisibility: true,
      workspaceId: 'new-workspace',
      initialType: 'codex' as const,
      creationCheckpoint: checkpoint,
      onCreated,
    };
    const view = render(createElement(CreateAgentPanel, { ...props, visibility: initial }));
    const name = screen.getByRole('textbox', { name: 'createAgent.name' });
    fireEvent.change(name, { target: { value: 'My retained draft' } });
    view.rerender(createElement(CreateAgentPanel, { ...props, visibility: next }));
    expect(screen.getByRole('textbox', { name: 'createAgent.name' })).toBe(name);
    expect(name).toHaveProperty('value', 'My retained draft');
    const create = screen.getByText('createAgent.create').closest('button')!;
    await waitFor(() => expect(create.disabled).toBe(false));
    fireEvent.submit(create.closest('form')!);
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(`My retained draft/${next}`, undefined),
    );
  },
);
