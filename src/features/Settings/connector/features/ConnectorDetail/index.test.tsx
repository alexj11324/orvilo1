/**
 * @vitest-environment happy-dom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrviloSkillStatus } from '@/store/tool/slices/orviloSkillStore/types';

import SkillDetail from './index';

const mocks = vi.hoisted(() => {
  const toolState = {
    builtinSkills: [],
    checkOrviloSkillStatus: vi.fn(),
    composioServers: [] as Array<{ identifier: string; status: string }>,
    connectors: [] as Array<{ id: string; identifier: string }>,
    createComposioConnection: vi.fn(),
    deleteAgentSkill: vi.fn(),
    fetchConnectors: vi.fn(),
    getOrviloSkillAuthorizeUrl: vi.fn(),
    installBuiltinTool: vi.fn(),
    installedBuiltinIds: [] as string[],
    installedPlugins: [] as Array<{
      customParams?: { mcp?: Record<string, unknown> };
      identifier: string;
      type: string;
    }>,
    orviloSkillServers: [] as Array<{
      identifier: string;
      isConnected: boolean;
      name: string;
      status: string;
      tools?: Array<{
        description?: string;
        inputSchema: Record<string, unknown>;
        name: string;
      }>;
    }>,
    refreshComposioConnectionStatus: vi.fn(),
    reauthorizeComposioConnection: vi.fn(),
    removeComposioConnection: vi.fn(),
    revokeOrviloSkill: vi.fn(),
    syncBuiltinTool: vi.fn(),
    syncPluginTools: vi.fn(),
    syncToolsFromClient: vi.fn(),
    uninstallBuiltinTool: vi.fn(),
  };

  function selectToolStore<T>(selector: (state: typeof toolState) => T): T {
    return selector(toolState);
  }

  const useToolStoreWithState = Object.assign(vi.fn(selectToolStore), {
    getState: vi.fn(() => toolState),
  });

  return {
    confirmModal: vi.fn(),
    permissions: {
      create_content: true,
      edit_own_content: true,
    },
    toolState,
    useToolStore: useToolStoreWithState,
    userState: { userId: 'user-id' },
  };
});

vi.mock('@orvilo/const', () => ({
  COMPOSIO_APP_TYPES: [{ appSlug: 'gmail', identifier: 'gmail', label: 'Gmail' }],
  isDesktop: false,
  getComposioAppByIdentifier: (identifier: string) =>
    identifier === 'gmail' ? { label: 'Gmail' } : undefined,
  getOrviloSkillProviderById: (identifier: string) =>
    identifier === 'notion'
      ? {
          label: 'Notion',
        }
      : undefined,
}));

vi.mock('@/components/Modal', () => ({
  confirmModal: mocks.confirmModal,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; name?: string } | string) => {
      const translations: Record<string, string> = {
        'tools.orviloSkill.connect': 'Connect',
        'tools.orviloSkill.disconnect': 'Disconnect',
        'tools.orviloSkill.disconnectConfirm.desc': `Disconnect ${(options as { name?: string })?.name}?`,
        'tools.orviloSkill.disconnectConfirm.title': `Disconnect ${(options as { name?: string })?.name}`,
        'tools.legacyConnector.configure': 'Configure',
        'tools.legacyConnector.upgradeDesc':
          'This connector still uses the legacy plugin format. Configure it to finish upgrading, then manage its tool permissions here.',
        'tools.noConfigurablePermissions':
          'This skill does not expose configurable tool permissions.',
        'tools.notConnected.desc': 'Not connected yet.',
      };

      if (translations[key]) return translations[key];
      if (typeof options === 'object' && options?.defaultValue) return options.defaultValue;

      return key;
    },
  }),
}));

vi.mock('@/features/AgentSkillDetail', () => ({
  default: () => <div data-testid="agent-skill-detail" />,
}));

vi.mock('@/features/Connectors', () => ({
  ConnectorDetail: ({
    connectAction,
    connectorId,
    lifecycleActions,
  }: {
    connectAction?: ReactNode;
    connectorId: string;
    lifecycleActions?: ReactNode;
  }) => (
    <div data-testid="connector-detail">
      <span>{connectorId}</span>
      {connectAction}
      {lifecycleActions}
    </div>
  ),
  CustomConnectorModal: ({ open }: { open?: boolean }) =>
    open ? <div data-testid="migration-modal" /> : null,
}));

vi.mock('./PresetConnectButton', () => ({
  default: ({ connector }: { connector: { id: string } }) => (
    <button type="button">Connect preset {connector.id}</button>
  ),
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: (action: 'create_content' | 'edit_own_content') => ({
    allowed: mocks.permissions[action],
    reason: '',
  }),
}));

vi.mock('@/store/tool', () => ({
  useToolStore: mocks.useToolStore,
}));

vi.mock('@/store/tool/selectors', () => ({
  builtinToolSelectors: {
    isBuiltinToolInstalled:
      (identifier: string) =>
      (state: typeof mocks.toolState): boolean =>
        state.installedBuiltinIds.includes(identifier),
  },
  composioStoreSelectors: {
    getServerByIdentifier:
      (identifier: string) =>
      (
        state: typeof mocks.toolState,
      ): (typeof mocks.toolState.composioServers)[number] | undefined =>
        state.composioServers.find((server) => server.identifier === identifier),
  },
  orviloSkillStoreSelectors: {
    getServerByIdentifier:
      (identifier: string) =>
      (
        state: typeof mocks.toolState,
      ): (typeof mocks.toolState.orviloSkillServers)[number] | undefined =>
        state.orviloSkillServers.find((server) => server.identifier === identifier),
  },
}));

vi.mock('@/store/tool/slices/connector', () => ({
  connectorSelectors: {
    connectorByIdentifier:
      (identifier: string) =>
      (state: typeof mocks.toolState): (typeof mocks.toolState.connectors)[number] | undefined =>
        state.connectors.find((connector) => connector.identifier === identifier),
  },
}));

// Mock the real selector to avoid pulling its `toolAvailability` → `skillFilters`
// → `@orvilo/const` (isDesktop) transitive imports into the unit env; mirror
// the real `getCustomPluginById` behaviour against the mocked tool state.
vi.mock('@/store/tool/slices/plugin/selectors', () => ({
  pluginSelectors: {
    getCustomPluginById:
      (identifier: string) =>
      (
        state: typeof mocks.toolState,
      ): (typeof mocks.toolState.installedPlugins)[number] | undefined =>
        state.installedPlugins.find(
          (plugin) => plugin.identifier === identifier && plugin.type === 'customPlugin',
        ),
  },
}));

vi.mock('@/store/user', () => ({
  useUserStore<T>(selector: (state: typeof mocks.userState) => T): T {
    return selector(mocks.userState);
  },
}));

vi.mock('@/store/user/selectors', () => ({
  userProfileSelectors: {
    userId: (state: typeof mocks.userState) => state.userId,
  },
}));

const presetActions = {
  addPreset: vi.fn(),
  closeForm: vi.fn(),
  githubConnecting: false,
  githubTimedOut: false,
  openForm: vi.fn(),
  showForm: false,
};

const connectedNotionServer = () => ({
  identifier: 'notion',
  isConnected: true,
  name: 'Notion',
  status: OrviloSkillStatus.CONNECTED,
});

describe('SkillDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mocks.permissions.create_content = true;
    mocks.permissions.edit_own_content = true;
    mocks.toolState.composioServers = [];
    mocks.toolState.connectors = [];
    mocks.toolState.installedBuiltinIds = [];
    mocks.toolState.installedPlugins = [];
    mocks.toolState.orviloSkillServers = [];
  });

  it.each(['pending_auth', 'error'])(
    'reauthorizes a %s Composio connection from its detail pane',
    async (status) => {
      const user = userEvent.setup();
      mocks.toolState.composioServers = [{ identifier: 'gmail', status }];
      mocks.toolState.reauthorizeComposioConnection.mockResolvedValue({
        identifier: 'gmail',
        redirectUrl: 'https://auth.example.com/gmail',
        status: 'pending_auth',
      });
      const open = vi.spyOn(window, 'open').mockReturnValue(null);

      render(<SkillDetail identifier="gmail" presetActions={presetActions} type="plugin" />);
      await user.click(await screen.findByRole('button', { name: 'Connect' }));

      await waitFor(() =>
        expect(mocks.toolState.reauthorizeComposioConnection).toHaveBeenCalledWith('gmail'),
      );
      expect(mocks.toolState.createComposioConnection).not.toHaveBeenCalled();
      expect(open).toHaveBeenCalledWith(
        'https://auth.example.com/gmail',
        '_blank',
        'width=600,height=700',
      );
    },
  );

  it('creates an absent Composio connection and follows its authorization URL', async () => {
    const user = userEvent.setup();
    mocks.toolState.createComposioConnection.mockResolvedValue({
      identifier: 'gmail',
      redirectUrl: 'https://auth.example.com/new-gmail',
      status: 'pending_auth',
    });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    render(<SkillDetail identifier="gmail" presetActions={presetActions} type="plugin" />);
    await user.click(await screen.findByRole('button', { name: 'Connect' }));

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        'https://auth.example.com/new-gmail',
        '_blank',
        'width=600,height=700',
      ),
    );
    expect(mocks.toolState.createComposioConnection).toHaveBeenCalledWith({
      appSlug: 'gmail',
      identifier: 'gmail',
      label: 'Gmail',
    });
    expect(mocks.toolState.reauthorizeComposioConnection).not.toHaveBeenCalled();
  });

  it('renders a stored MCP connector and delegates its preset connection action', async () => {
    mocks.toolState.connectors = [{ id: 'connector-1', identifier: 'linear' }];

    render(<SkillDetail identifier="linear" presetActions={presetActions} type="mcp-connector" />);

    expect(await screen.findByTestId('connector-detail')).toHaveTextContent('connector-1');
    expect(await screen.findByRole('button', { name: 'Connect preset connector-1' })).toBeEnabled();
  });

  it('offers a Configure migration action for an un-migrated legacy custom MCP', async () => {
    // Legacy `user_installed_plugins` custom MCP with an mcp config but no
    // matching `user_connectors` row → the panel should surface the migration
    // entry instead of the dead-end "no configurable permissions" copy.
    mocks.toolState.installedPlugins = [
      {
        customParams: { mcp: { type: 'http', url: 'https://mcp.example.com' } },
        identifier: 'my-mcp',
        type: 'customPlugin',
      },
    ];

    render(<SkillDetail identifier="my-mcp" presetActions={presetActions} type="mcp-connector" />);

    expect(await screen.findByRole('button', { name: 'Configure' })).toBeEnabled();
    expect(
      screen.getByText(
        'This connector still uses the legacy plugin format. Configure it to finish upgrading, then manage its tool permissions here.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('This skill does not expose configurable tool permissions.'),
    ).not.toBeInTheDocument();
  });

  it('shows a disconnect action for a connected Orvilo connector without configurable tools', async () => {
    mocks.toolState.orviloSkillServers = [connectedNotionServer()];

    render(
      <SkillDetail identifier="notion" presetActions={presetActions} type="orvilo-connector" />,
    );

    expect(
      await screen.findByText('This skill does not expose configurable tool permissions.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Notion')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeEnabled();
    expect(mocks.toolState.syncToolsFromClient).not.toHaveBeenCalled();
  });

  it('syncs Orvilo tools and passes the disconnect action into connector permissions detail', async () => {
    mocks.toolState.connectors = [{ id: 'connector-1', identifier: 'notion' }];
    mocks.toolState.orviloSkillServers = [
      {
        ...connectedNotionServer(),
        tools: [
          {
            description: 'Search pages',
            inputSchema: { type: 'object' },
            name: 'search',
          },
        ],
      },
    ];

    render(
      <SkillDetail identifier="notion" presetActions={presetActions} type="orvilo-connector" />,
    );

    expect(await screen.findByTestId('connector-detail')).toHaveTextContent('connector-1');
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.toolState.syncToolsFromClient).toHaveBeenCalledWith({
        identifier: 'notion',
        name: 'Notion',
        sourceType: 'marketplace',
        tools: [
          {
            description: 'Search pages',
            inputSchema: { type: 'object' },
            toolName: 'search',
          },
        ],
      }),
    );
  });

  it('only leaves connector permissions detail after disconnect actually succeeds', async () => {
    const user = userEvent.setup();
    mocks.toolState.connectors = [{ id: 'connector-1', identifier: 'notion' }];
    mocks.toolState.orviloSkillServers = [
      {
        ...connectedNotionServer(),
        tools: [
          {
            inputSchema: { type: 'object' },
            name: 'search',
          },
        ],
      },
    ];
    mocks.confirmModal.mockImplementation(({ onOk }: { onOk?: () => Promise<void> }) => {
      void onOk?.();
    });
    mocks.toolState.revokeOrviloSkill.mockResolvedValue(undefined);

    render(
      <SkillDetail identifier="notion" presetActions={presetActions} type="orvilo-connector" />,
    );

    await user.click(await screen.findByRole('button', { name: 'Disconnect' }));

    expect(mocks.confirmModal).toHaveBeenCalled();
    expect(await screen.findByTestId('connector-detail')).toBeInTheDocument();
    expect(
      screen.queryByText('This skill does not expose configurable tool permissions.'),
    ).not.toBeInTheDocument();
  });

  it('returns to the not-connected pane after a successful disconnect', async () => {
    const user = userEvent.setup();
    const server = {
      ...connectedNotionServer(),
      tools: [
        {
          inputSchema: { type: 'object' },
          name: 'search',
        },
      ],
    };
    mocks.toolState.connectors = [{ id: 'connector-1', identifier: 'notion' }];
    mocks.toolState.orviloSkillServers = [server];
    mocks.confirmModal.mockImplementation(({ onOk }: { onOk?: () => Promise<void> }) => {
      void onOk?.();
    });
    mocks.toolState.revokeOrviloSkill.mockImplementation(async () => {
      server.isConnected = false;
      server.status = OrviloSkillStatus.NOT_CONNECTED;
    });

    render(
      <SkillDetail identifier="notion" presetActions={presetActions} type="orvilo-connector" />,
    );

    await user.click(await screen.findByRole('button', { name: 'Disconnect' }));

    await waitFor(() => expect(screen.getByText('Not connected yet.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument();
  });
});
