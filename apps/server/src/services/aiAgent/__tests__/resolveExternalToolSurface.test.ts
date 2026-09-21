import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveExternalToolSurface } from '../pipeline/resolveExternalToolSurface';

const { mockConnectorTools, mockFindPlugin, mockResolveConnectors } = vi.hoisted(() => ({
  mockConnectorTools: vi.fn(),
  mockFindPlugin: vi.fn(),
  mockResolveConnectors: vi.fn(),
}));

vi.mock('@/database/models/connector', () => ({
  ConnectorModel: vi.fn().mockImplementation(function () {
    return { resolveByIdentifiers: mockResolveConnectors };
  }),
}));

vi.mock('@/database/models/connectorTool', () => ({
  ConnectorToolModel: vi.fn().mockImplementation(function () {
    return { queryByConnectorIds: mockConnectorTools };
  }),
}));

vi.mock('@/database/models/plugin', () => ({
  PluginModel: vi.fn().mockImplementation(function () {
    return { findById: mockFindPlugin };
  }),
}));

const baseInput = {
  db: {} as any,
  userId: 'user_1',
  workspaceId: 'ws_1',
};

describe('resolveExternalToolSurface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty map when no candidates are given', async () => {
    expect(await resolveExternalToolSurface({ ...baseInput, candidateIds: [] })).toEqual({});
    expect(mockResolveConnectors).not.toHaveBeenCalled();
  });

  it('mounts an enabled connector with its synced api list', async () => {
    mockResolveConnectors.mockResolvedValue([
      { id: 'conn_1', identifier: 'my-conn', isEnabled: true },
    ]);
    mockConnectorTools.mockResolvedValue([
      {
        description: 'Do a thing',
        inputSchema: { type: 'object' },
        toolName: 'do_thing',
        userConnectorId: 'conn_1',
      },
    ]);

    const surface = await resolveExternalToolSurface({
      ...baseInput,
      agentId: 'agt_1',
      candidateIds: ['my-conn'],
    });

    expect(mockResolveConnectors).toHaveBeenCalledWith(['my-conn'], 'agt_1');
    expect(surface['my-conn']).toEqual({
      apis: [{ description: 'Do a thing', name: 'do_thing', parameters: { type: 'object' } }],
      callable: true,
      pins: {
        authRevision: expect.any(String),
        connectorId: 'conn_1',
        schemaDigests: { do_thing: expect.any(String) },
      },
      source: 'connector',
    });
  });

  it('never surfaces a disabled connector — it is absent, not mounted', async () => {
    mockResolveConnectors.mockResolvedValue([
      { id: 'conn_1', identifier: 'my-conn', isEnabled: false },
    ]);
    const surface = await resolveExternalToolSurface({
      ...baseInput,
      candidateIds: ['my-conn'],
    });
    expect(surface['my-conn']).toBeUndefined();
    expect(mockConnectorTools).not.toHaveBeenCalled();
  });

  it('mounts an installed MCP plugin only when it has transport params', async () => {
    mockResolveConnectors.mockResolvedValue([]);
    mockFindPlugin.mockResolvedValue({
      customParams: { mcp: { command: 'npx', type: 'stdio' } },
      manifest: {
        api: [{ description: 'Query', name: 'query', parameters: {} }],
        identifier: 'my-plugin',
      },
    });
    const surface = await resolveExternalToolSurface({
      ...baseInput,
      candidateIds: ['my-plugin'],
    });
    expect(surface['my-plugin']).toMatchObject({
      callable: true,
      source: 'mcp-plugin',
    });

    mockFindPlugin.mockResolvedValue({
      customParams: {},
      manifest: { api: [{ name: 'query', parameters: {} }], identifier: 'my-plugin' },
    });
    const noTransport = await resolveExternalToolSurface({
      ...baseInput,
      candidateIds: ['my-plugin'],
    });
    expect(noTransport['my-plugin']).toMatchObject({ callable: false, source: 'mcp-plugin' });
  });

  it('lets a connector shadow a plugin install for the same identifier', async () => {
    mockResolveConnectors.mockResolvedValue([{ id: 'conn_1', identifier: 'dup', isEnabled: true }]);
    mockConnectorTools.mockResolvedValue([{ toolName: 't', userConnectorId: 'conn_1' }]);
    const surface = await resolveExternalToolSurface({
      ...baseInput,
      candidateIds: ['dup'],
    });
    expect(surface['dup']?.source).toBe('connector');
    expect(mockFindPlugin).not.toHaveBeenCalled();
  });

  it('degrades to absent on model errors instead of throwing', async () => {
    mockResolveConnectors.mockRejectedValue(new Error('db down'));
    mockFindPlugin.mockRejectedValue(new Error('db down'));
    const surface = await resolveExternalToolSurface({
      ...baseInput,
      candidateIds: ['my-conn'],
    });
    expect(surface).toEqual({});
  });
});
