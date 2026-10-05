/** @vitest-environment happy-dom */
import { fireEvent, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AgentModelSettings from './AgentModelSettings';
import AgentOpeningSettings from './AgentOpeningSettings';

dayjs.extend(relativeTime);

const state = vi.hoisted(() => ({
  config: { agencyConfig: { heterogeneousProvider: { type: 'orvilo' } } },
  bindings: [],
  response: {
    data: undefined as unknown,
    error: undefined as unknown,
    isLoading: true,
    mutate: vi.fn(),
  },
  update: vi.fn(),
  catalogError: undefined as unknown,
  catalogRetry: vi.fn(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (s: unknown) => unknown) =>
    selector({ updateAgentConfigById: state.update }),
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
    agencyConfig: {},
    workspaceScoped: false,
    isPreferenceLoading: false,
  }),
}));
vi.mock('@/hooks/useEffectiveWorkingDirectory', () => ({
  useEffectiveWorkingDirectory: () => '/tmp',
}));
vi.mock('@/features/DeviceManager/useDeviceList', () => ({
  useDeviceList: () => ({ isLoading: false }),
}));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => vi.fn(),
}));
vi.mock('@/features/ChatInput/ControlBar/HeteroModel/useModelCatalog', () => ({
  useModelCatalog: () => ({
    data: { models: [{ id: 'model-one', modelId: 'model-one', label: 'Provider/Model One' }] },
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
    state.config.agencyConfig.heterogeneousProvider.type = 'orvilo';
    state.catalogError = undefined;
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

  it('shows the friendly model label without its catalog provider prefix', async () => {
    state.config.agencyConfig.heterogeneousProvider.type = 'opencode';
    const view = render(<AgentModelSettings agentId="agt_one" />);
    await userEvent.setup().click(view.getByRole('combobox'));
    expect(view.getByRole('option', { name: 'Model One' })).toBeTruthy();
    expect(view.queryByText('Provider/Model One')).toBeNull();
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
