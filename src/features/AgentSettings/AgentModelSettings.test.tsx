/** @vitest-environment happy-dom */
import { fireEvent, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AgentModelSettings from './AgentModelSettings';

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
    data: { models: [{ id: 'model-one', modelId: 'model-one', label: 'Model One' }] },
    isLoading: false,
  }),
}));
vi.mock('@/components/NeuralNetworkLoading', () => ({
  default: () => <div role="status">Loading</div>,
}));

describe('Agent model settings states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.config.agencyConfig.heterogeneousProvider.type = 'orvilo';
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

  it('explains a catalog search with no matching models', async () => {
    state.config.agencyConfig.heterogeneousProvider.type = 'opencode';
    const user = userEvent.setup();
    const view = render(<AgentModelSettings agentId="agt_one" />);
    const input = view.getByRole('combobox');
    await user.clear(input);
    await user.type(input, 'zz-no-matching-model');
    expect(view.getByText('common:cmdk.noResults')).toBeTruthy();
  });
});
