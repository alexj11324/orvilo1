import { describe, expect, it, vi } from 'vitest';

import { syncConnectorToolsById } from './sync';

const { buildGitHubParams, listRawTools } = vi.hoisted(() => ({
  buildGitHubParams: vi.fn(),
  listRawTools: vi.fn(),
}));

vi.mock('./githubMcp', () => ({
  buildGitHubMcpParams: buildGitHubParams,
  isGitHubMcpConnector: (connector: any) =>
    connector.metadata?.githubMcp?.type === 'github_user_connection',
}));
vi.mock('@/server/services/mcp', () => ({ mcpService: { listRawTools } }));

describe('syncConnectorToolsById GitHub provider', () => {
  it('replaces a legacy PAT tool list with the exact read-only provider surface', async () => {
    const connector = {
      credentials: null,
      id: 'github-connector',
      identifier: 'github-mcp',
      isEnabled: true,
      mcpConnectionType: 'http',
      mcpServerUrl: 'https://api.githubcopilot.com/mcp/',
      metadata: {
        githubMcp: { grantOwnerUserId: 'user-1', type: 'github_user_connection' },
      },
      name: 'GitHub',
    };
    buildGitHubParams.mockResolvedValue({
      cacheMode: 'ephemeral',
      name: 'github-mcp',
      type: 'http',
      url: 'https://api.githubcopilot.com/mcp/',
    });
    listRawTools.mockResolvedValue([
      {
        description: 'Read a pull request',
        inputSchema: { type: 'object' },
        name: 'pull_request_read',
      },
    ]);
    const connectorModel = {
      findById: vi.fn().mockResolvedValue(connector),
      updateStatus: vi.fn(),
    };
    const connectorToolModel = {
      deleteToolsNotIn: vi.fn(),
      upsertMany: vi.fn(),
    };

    await expect(
      syncConnectorToolsById('github-connector', {
        connectorModel,
        connectorToolModel,
        serverDB: {} as never,
      } as any),
    ).resolves.toEqual({ toolCount: 1 });

    expect(connectorToolModel.upsertMany).toHaveBeenCalledWith(
      'github-connector',
      expect.arrayContaining([expect.objectContaining({ toolName: 'pull_request_read' })]),
    );
    expect(connectorToolModel.deleteToolsNotIn).toHaveBeenCalledWith('github-connector', [
      'pull_request_read',
    ]);
  });
});
