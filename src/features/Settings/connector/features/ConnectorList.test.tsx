/**
 * @vitest-environment happy-dom
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ConnectorList from './ConnectorList';

const mocks = vi.hoisted(() => {
  const toolState = {
    agentBoundConnectors: [] as Array<{ id: string }>,
    composioServers: [] as Array<{ identifier: string }>,
    connectors: [] as Array<{ id: string; identifier: string }>,
    fetchAgentBoundConnectors: vi.fn(),
    fetchConnectors: vi.fn(),
    installedPlugins: [] as Array<{ identifier: string; type: string }>,
    isAgentBoundInit: false,
    isConnectorsInit: false,
    orviloSkillServers: [] as Array<{ identifier: string }>,
    useFetchOrviloSkillConnections: vi.fn(),
    useFetchUserComposioConnections: vi.fn(),
  };

  function selectToolStore<T>(selector: (state: typeof toolState) => T): T {
    return selector(toolState);
  }

  return {
    toolState,
    useToolStore: Object.assign(vi.fn(selectToolStore), {
      getState: vi.fn(() => toolState),
    }),
    workspaceId: null as string | null,
  };
});

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => mocks.workspaceId,
}));

vi.mock('@/hooks/useFetchInstalledPlugins', () => ({
  useFetchInstalledPlugins: vi.fn(),
}));

vi.mock('@/store/serverConfig', () => ({
  serverConfigSelectors: {
    enableComposio: () => false,
    enableOrviloSkill: () => false,
  },
  useServerConfigStore: (selector: (state: object) => unknown) => selector({}),
}));

vi.mock('@/store/tool', () => ({
  useToolStore: mocks.useToolStore,
}));

vi.mock('@/store/tool/selectors', () => ({
  composioStoreSelectors: { getServers: (s: typeof mocks.toolState) => s.composioServers },
  orviloSkillStoreSelectors: { getServers: (s: typeof mocks.toolState) => s.orviloSkillServers },
  pluginSelectors: {
    installedPluginMetaList: (s: typeof mocks.toolState) => s.installedPlugins,
  },
}));

vi.mock('@/store/tool/slices/connector', () => ({
  connectorSelectors: {
    agentBoundConnectors: (s: typeof mocks.toolState) => s.agentBoundConnectors,
    customConnectors: (s: typeof mocks.toolState) => s.connectors,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('./AgentConnectorItem', () => ({ default: () => null }));
vi.mock('./ComposioSkillItem', () => ({ default: () => null }));
vi.mock('./McpPresetItem', () => ({ default: () => null }));
vi.mock('./McpSkillItem', () => ({ default: () => null }));
vi.mock('./OrviloSkillItem', () => ({ default: () => null }));

describe('ConnectorList scope-keyed fetching', () => {
  beforeEach(() => {
    mocks.workspaceId = null;
    mocks.toolState.agentBoundConnectors = [];
    mocks.toolState.composioServers = [];
    mocks.toolState.connectors = [];
    mocks.toolState.installedPlugins = [];
    mocks.toolState.isAgentBoundInit = false;
    mocks.toolState.isConnectorsInit = false;
    mocks.toolState.orviloSkillServers = [];
    vi.clearAllMocks();
  });

  it('refetches connector lists when the workspace scope resolves after a latched init', () => {
    // The stale-latch case: an earlier personal-scope fetch already set the
    // init flags, so an init-gated effect would never refetch — the list
    // stays empty until the workspace id lands and a scope-keyed fetch runs.
    mocks.toolState.isConnectorsInit = true;
    mocks.toolState.isAgentBoundInit = true;

    const { rerender } = render(<ConnectorList onAddPreset={vi.fn()} onSelect={vi.fn()} />);

    expect(mocks.toolState.fetchConnectors).toHaveBeenCalledTimes(1);
    expect(mocks.toolState.fetchAgentBoundConnectors).toHaveBeenCalledTimes(1);

    mocks.workspaceId = 'ws-1';
    rerender(<ConnectorList onAddPreset={vi.fn()} onSelect={vi.fn()} />);

    expect(mocks.toolState.fetchConnectors).toHaveBeenCalledTimes(2);
    expect(mocks.toolState.fetchAgentBoundConnectors).toHaveBeenCalledTimes(2);
  });

  it('does not refetch when the workspace scope is unchanged', () => {
    const { rerender } = render(<ConnectorList onAddPreset={vi.fn()} onSelect={vi.fn()} />);

    rerender(<ConnectorList onAddPreset={vi.fn()} onSelect={vi.fn()} />);

    expect(mocks.toolState.fetchConnectors).toHaveBeenCalledTimes(1);
    expect(mocks.toolState.fetchAgentBoundConnectors).toHaveBeenCalledTimes(1);
  });
});
