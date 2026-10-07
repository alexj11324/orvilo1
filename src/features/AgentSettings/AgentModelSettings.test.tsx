/** @vitest-environment happy-dom */
import type { HeterogeneousProviderConfig, OrviloAgentAgencyConfig } from '@orvilo/types';
import { fireEvent, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AgentModelSettings from './AgentModelSettings';
import AgentOpeningSettings from './AgentOpeningSettings';

dayjs.extend(relativeTime);

const state = vi.hoisted(() => ({
  config: {
    agencyConfig: { heterogeneousProvider: { type: 'orvilo' } as HeterogeneousProviderConfig },
  },
  effectiveAgencyConfig: {
    executionTarget: 'device',
    boundDeviceId: 'device-current',
  } as OrviloAgentAgencyConfig,
  candidateIds: [] as string[],
  candidateInventoryComplete: true,
  bindings: [],
  response: {
    data: undefined as unknown,
    error: undefined as unknown,
    isLoading: true,
    mutate: vi.fn(),
  },
  update: vi.fn(),
  catalogModels: [{ id: 'model-one', modelId: 'model-one', label: 'Provider/Model One' }],
  catalogError: undefined as unknown,
  catalogRetry: vi.fn(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (s: unknown) => unknown) =>
    selector({ updateAgentConfigById: state.update, localAgentWorkingDirectoryMap: {} }),
}));
vi.mock('@/store/agent/selectors', () => ({
  agentSelectors: { getAgentConfigById: () => () => state.config },
}));
vi.mock('@/store/providerBinding', () => ({
  useProviderBindingStore: (selector: (s: unknown) => unknown) =>
    selector({ bindings: state.bindings }),
  useFetchProviderBindings: () => state.response,
}));
vi.mock('@/store/aiInfra', () => ({
  useAiInfraStore: (selector: (s: unknown) => unknown) => selector({ builtinAiModelList: [] }),
}));
vi.mock('@/store/electron', () => ({
  useElectronStore: (selector: (s: unknown) => unknown) =>
    selector({ useFetchGatewayDeviceInfo: () => {} }),
}));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ allowed: true }) }));
vi.mock('@/hooks/useEffectiveAgencyConfig', () => ({
  useEffectiveAgencyConfig: () => ({
    agencyConfig: state.effectiveAgencyConfig,
    workspaceScoped: false,
    isPreferenceLoading: false,
  }),
}));
vi.mock('@/hooks/useEffectiveWorkingDirectory', () => ({
  useEffectiveWorkingDirectory: () => '/tmp',
}));
vi.mock('@/features/DeviceManager/useDeviceList', () => ({
  useDeviceList: () => ({
    isLoading: false,
    data: [{ deviceId: 'device-one', defaultCwd: '/device-default' }],
  }),
  useAgentDeviceCandidates: () => ({
    data: {
      inventoryComplete: state.candidateInventoryComplete,
      candidates: state.candidateIds.map((deviceId) => ({
        deviceId,
        scopeOk: true,
        capabilityOk: true,
        versionOk: true,
        online: true,
      })),
    },
    isLoading: false,
    mutate: vi.fn(),
  }),
}));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => vi.fn(),
}));
vi.mock('@/features/ChatInput/ControlBar/HeteroModel/useModelCatalog', () => ({
  useModelCatalog: ({ targetReady }: { targetReady: boolean }) => ({
    data: targetReady ? { models: state.catalogModels } : undefined,
    isLoading: false,
    error: state.catalogError,
    mutate: state.catalogRetry,
  }),
}));
vi.mock('@/components/NeuralNetworkLoading', () => ({
  default: () => <div role="status">Loading</div>,
}));

describe('Agent model settings states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.config.agencyConfig.heterogeneousProvider = { type: 'orvilo' };
    state.catalogError = undefined;
    state.effectiveAgencyConfig = { executionTarget: 'device', boundDeviceId: 'device-current' };
    state.candidateIds = [];
    state.candidateInventoryComplete = true;
    state.catalogModels = [{ id: 'model-one', modelId: 'model-one', label: 'Provider/Model One' }];
    state.response = { data: undefined, error: undefined, isLoading: true, mutate: vi.fn() };
  });

  it('waits for bindings before telling the user to connect a provider', () => {
    const view = render(<AgentModelSettings agentId="agt_one" />);
    expect(view.queryByText('settingAgent.modelSettings.noBindingTitle')).toBeNull();
    expect(view.getByRole('status').textContent).toBe('Loading');
    state.response = { ...state.response, data: { data: [] }, isLoading: false };
    view.rerender(<AgentModelSettings agentId="agt_two" />);
    expect(view.getByText('settingAgent.modelSettings.noBindingTitle')).toBeTruthy();
  });

  it('shows a binding fetch failure and retries the same request', () => {
    state.response = { ...state.response, error: new Error('offline'), isLoading: false };
    const view = render(<AgentModelSettings agentId="agt_one" />);
    expect(view.queryByText('settingAgent.modelSettings.noBindingTitle')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'error.retry' }));
    expect(state.response.mutate).toHaveBeenCalledOnce();
  });

  it('uses the Claude ACP catalog name and saves its exact ID with exact runtime identity', async () => {
    state.config.agencyConfig.heterogeneousProvider = {
      args: ['--model', 'old-alias', '--verbose'],
      type: 'claude-code',
    };
    const view = render(<AgentModelSettings agentId="agt_one" />);
    expect(view.queryByText('settingAgent.modelSettings.effortLabel')).toBeNull();
    expect(view.queryByText('settingAgent.modelSettings.modeLabel')).toBeNull();
    expect(view.queryByText('settingAgent.modelSettings.speedLabel')).toBeNull();
    await userEvent.setup().click(view.getAllByRole('combobox')[0]);
    expect(view.queryByRole('option', { name: 'Haiku' })).toBeNull();
    await userEvent
      .setup()
      .click(view.getByRole('option', { name: 'Provider/Model One model-one' }));
    await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
    expect(state.update.mock.calls[0][1]).toEqual({
      agencyConfig: { heterogeneousProvider: { args: ['--verbose'], model: 'model-one' } },
    });
  });

  it('keeps the advertised default once and distinguishes identical runtime names by ID', async () => {
    state.config.agencyConfig.heterogeneousProvider = { type: 'claude-code' };
    state.catalogModels = [
      { id: 'default', modelId: 'default', label: 'Default (recommended)' },
      { id: 'runtime-one', modelId: 'runtime-one', label: 'Exact Runtime Name' },
      { id: 'runtime-two', modelId: 'runtime-two', label: 'Exact Runtime Name' },
    ];
    const view = render(<AgentModelSettings agentId="agt_one" />);
    expect(view.getByRole('combobox').textContent).toContain('heteroAgent.modelSelector.default');
    await userEvent.setup().click(view.getByRole('combobox'));
    expect(view.getAllByRole('option')).toHaveLength(4);
    expect(view.getByRole('option', { name: 'Exact Runtime Name runtime-one' })).toBeTruthy();
    expect(view.getByRole('option', { name: 'Exact Runtime Name runtime-two' })).toBeTruthy();
    await userEvent
      .setup()
      .click(view.getByRole('option', { name: 'Default (recommended) default' }));
    await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
    expect(state.update.mock.calls[0][1]).toEqual({
      agencyConfig: { heterogeneousProvider: { args: ['--model', 'default'], model: 'default' } },
    });
  });

  it('shows an unknown saved model ID verbatim when discovery fails', () => {
    state.config.agencyConfig.heterogeneousProvider = {
      type: 'claude-code',
      model: 'provider/full/unknown-id',
    };
    state.catalogModels = [];
    state.catalogError = new Error('unavailable');
    const view = render(<AgentModelSettings agentId="agt_one" />);
    expect(view.getByRole('combobox').textContent).toContain('provider/full/unknown-id');
    expect(view.getByText('settingAgent.modelSettings.catalogError')).toBeTruthy();
  });

  it('loads the real model catalog for an unbound, confirmed singleton without saving a device', async () => {
    state.config.agencyConfig.heterogeneousProvider = { type: 'claude-code' };
    state.effectiveAgencyConfig = {};
    state.candidateIds = ['device-one'];
    const view = render(<AgentModelSettings agentId="agt_one" />);
    expect(view.queryByText('settingAgent.modelSettings.catalogPending')).toBeNull();
    await userEvent.setup().click(view.getByRole('combobox'));
    expect(view.getByRole('option', { name: 'Provider/Model One model-one' })).toBeTruthy();
    expect(state.update).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'does not guess an unbound model target from an incomplete or multiple candidate pool (%s)',
    async (complete) => {
      state.config.agencyConfig.heterogeneousProvider = { type: 'claude-code' };
      state.effectiveAgencyConfig = {};
      state.candidateIds = complete ? ['device-one', 'device-two'] : ['device-one'];
      state.candidateInventoryComplete = complete;
      const view = render(<AgentModelSettings agentId="agt_one" />);
      expect(view.getByText('settingAgent.modelSettings.catalogPending')).toBeTruthy();
      await userEvent.setup().click(view.getByRole('combobox'));
      expect(view.queryByRole('option', { name: 'Provider/Model One model-one' })).toBeNull();
      expect(state.update).not.toHaveBeenCalled();
    },
  );

  it('retries a failed catalog even when the picker is already open', async () => {
    state.config.agencyConfig.heterogeneousProvider.type = 'opencode';
    state.catalogError = new Error('catalog offline');
    const user = userEvent.setup();
    const view = render(<AgentModelSettings agentId="agt_one" />);
    await user.click(view.getByRole('combobox'));
    await user.click(view.getByRole('button', { name: 'createAgent.retry' }));
    expect(state.catalogRetry).toHaveBeenCalledOnce();
  });

  it('explains a catalog search with no matching models', async () => {
    state.config.agencyConfig.heterogeneousProvider.type = 'opencode';
    const user = userEvent.setup();
    const view = render(<AgentModelSettings agentId="agt_one" />);
    await user.click(view.getByRole('combobox'));
    const input = view.getByRole('combobox', { name: 'createAgent.model.search' });
    await user.clear(input);
    await user.type(input, 'zz-no-matching-model');
    expect(view.getByText('createAgent.model.empty')).toBeTruthy();
  });

  it('preserves the model name advertised by the runtime', async () => {
    state.config.agencyConfig.heterogeneousProvider.type = 'opencode';
    const view = render(<AgentModelSettings agentId="agt_one" />);
    await userEvent.setup().click(view.getByRole('combobox'));
    expect(view.getByRole('option', { name: 'Provider/Model One model-one' })).toBeTruthy();
  });
});

describe('Agent opening autosave recovery', () => {
  it('keeps a failed message retry available after questions save successfully', async () => {
    vi.clearAllMocks();
    let messageFailed = false;
    state.update.mockImplementation(
      async (_agentId: string, patch: { openingMessage?: string; openingQuestions?: string[] }) => {
        Object.assign(state.config, patch);
        if (patch.openingMessage !== undefined && !messageFailed) {
          messageFailed = true;
          throw new Error('message save unavailable');
        }
      },
    );
    const view = render(<AgentOpeningSettings agentId="agt_one" />);
    const message = view.getByRole('textbox', { name: 'settingAgent.opening.message' });
    const questions = view.getByRole('textbox', { name: 'settingAgent.opening.questions' });
    fireEvent.change(message, { target: { value: 'Hello from the Agent' } });
    fireEvent.blur(message);
    await waitFor(() => expect(state.update).toHaveBeenCalledTimes(1));
    fireEvent.change(questions, { target: { value: 'How can you help?' } });
    fireEvent.blur(questions);
    await waitFor(() => expect(state.update).toHaveBeenCalledTimes(2));
    const failedHint = await view.findByText(/autoSave.failed/);
    fireEvent.click(failedHint);
    await waitFor(() => expect(state.update).toHaveBeenCalledTimes(3));
    expect(state.update.mock.calls[2][1]).toEqual({ openingMessage: 'Hello from the Agent' });
    await waitFor(() => expect(view.queryByText(/autoSave.failed/)).toBeNull());
  });
});
