// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectorModel } from '@/database/models/connector';

import { connectorRouter } from '../connector';

const mocks = vi.hoisted(() => ({
  buildAuthorizationUrl: vi.fn(),
  discoverConnectorOAuth: vi.fn(),
  saveConnectorOAuthState: vi.fn(),
}));

vi.mock('@/database/models/agent', () => ({ AgentModel: vi.fn() }));
vi.mock('@/database/models/connector', () => ({ ConnectorModel: vi.fn() }));
vi.mock('@/database/models/connectorTool', () => ({ ConnectorToolModel: vi.fn() }));
vi.mock('@/database/models/plugin', () => ({ PluginModel: vi.fn() }));
vi.mock('@/server/modules/KeyVaultsEncrypt', () => ({
  KeyVaultsGateKeeper: { initWithEnvKey: async () => ({}) },
}));
vi.mock('@/business/server/trpc-middlewares/workspaceAuth', async () => {
  const mod = await vi.importActual<{ trpc: any }>('@/libs/trpc/lambda/init');
  return {
    requireWorkspaceRoleWhenScoped: () => mod.trpc.middleware(async (opts: any) => opts.next()),
    wsCompatProcedure: mod.trpc.procedure,
  };
});
vi.mock('@/libs/trpc/lambda/middleware', () => ({
  serverDatabase: async (opts: any) =>
    opts.next({ ctx: { ...opts.ctx, serverDB: opts.ctx.serverDB ?? {} } }),
}));
vi.mock('@/server/services/connector/oauth', () => ({
  buildAuthorizationUrl: mocks.buildAuthorizationUrl,
  discoverConnectorOAuth: mocks.discoverConnectorOAuth,
  getConnectorRedirectUri: () => 'https://app.example.com/oauth/connector/callback',
  registerDynamicClient: vi.fn(),
}));
vi.mock('@/server/services/connector/stateStore', () => ({
  generateConnectorOAuthState: () => 'state-1',
  saveConnectorOAuthState: mocks.saveConnectorOAuthState,
}));

const CONNECTOR_ID = '9f1f6f30-0000-4000-8000-000000000001';

describe('connectorRouter.startOAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ConnectorModel).mockImplementation(function () {
      return {
        findById: vi.fn().mockResolvedValue({
          id: CONNECTOR_ID,
          mcpServerUrl: 'https://mcp.example.com',
          oidcConfig: { clientId: 'client-1', scheme: 'pre_registration' },
          userId: 'user-1',
        }),
        update: vi.fn(),
      } as any;
    });
    mocks.discoverConnectorOAuth.mockResolvedValue({
      authorizationServerUrl: 'https://auth.example.com',
      metadata: {
        authorization_endpoint: 'https://auth.example.com/authorize',
        scopes_supported: ['read'],
        token_endpoint: 'https://auth.example.com/token',
      },
    });
    mocks.buildAuthorizationUrl.mockResolvedValue({
      authorizationUrl: 'https://auth.example.com/authorize?state=state-1',
      codeVerifier: 'verifier-1',
    });
  });

  it('binds OAuth state to the workspace selected at initiation', async () => {
    const result = await connectorRouter
      .createCaller({
        serverDB: {},
        userId: 'user-1',
        workspaceId: 'workspace-1',
        workspaceRole: 'member',
      } as any)
      .startOAuth({ id: CONNECTOR_ID });

    expect(result).toEqual({
      authorizationUrl: 'https://auth.example.com/authorize?state=state-1',
    });
    expect(mocks.saveConnectorOAuthState).toHaveBeenCalledWith('state-1', {
      authorizationServerUrl: 'https://auth.example.com',
      codeVerifier: 'verifier-1',
      connectorId: CONNECTOR_ID,
      orviloUserId: 'user-1',
      returnTo: undefined,
      workspaceId: 'workspace-1',
    });
  });
});
