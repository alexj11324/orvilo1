// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveConnectorMcpParams } from '@/server/services/connector/sync';
import { mcpService } from '@/server/services/mcp';

import { createConnectorEventsAdapter } from './connector';

vi.mock('@/server/services/connector/sync', () => ({ resolveConnectorMcpParams: vi.fn() }));
vi.mock('@/server/services/mcp', () => ({ mcpService: { requestEventProtocol: vi.fn() } }));

const base = {
  id: 'source',
  name: 'Source',
  isEnabled: true,
  status: 'connected',
  mcpConnectionType: 'http',
  mcpServerUrl: 'https://mcp.example.com',
  agentId: null,
};
const findById = vi.fn();
const context = { connectorModel: { findById }, serverDB: {} } as any;

beforeEach(() => {
  vi.clearAllMocks();
  findById.mockResolvedValue(base);
  vi.mocked(resolveConnectorMcpParams).mockResolvedValue({
    name: 'Source',
    type: 'http',
    url: base.mcpServerUrl,
  });
  vi.mocked(mcpService.requestEventProtocol).mockResolvedValue({
    resultType: 'complete',
    supportedVersions: [],
    capabilities: {},
  });
});

describe('authenticated event source adapter', () => {
  it.each([
    null,
    { ...base, isEnabled: false },
    { ...base, status: 'disconnected' },
    { ...base, agentId: 'other-agent' },
    { ...base, metadata: { mountedByAgentId: 'other-agent' } },
    { ...base, mcpConnectionType: 'stdio' },
    { ...base, mcpServerUrl: 'http://127.0.0.1:9000' },
  ])('rejects unavailable scoped connector before network admission', async (connector) => {
    findById.mockResolvedValue(connector);
    await expect(createConnectorEventsAdapter('source', context).discover()).rejects.toThrow(
      'unavailable',
    );
    expect(resolveConnectorMcpParams).not.toHaveBeenCalled();
    expect(mcpService.requestEventProtocol).not.toHaveBeenCalled();
  });
  it('uses scoped connector credentials and rechecks access on every operation', async () => {
    const adapter = createConnectorEventsAdapter('source', context);
    expect(await adapter.discover()).toEqual({ supported: false, events: [] });
    expect(findById).toHaveBeenCalledWith('source');
    expect(mcpService.requestEventProtocol).toHaveBeenCalledWith(
      expect.objectContaining({ url: base.mcpServerUrl }),
      'server/discover',
      undefined,
      undefined,
    );
    findById.mockResolvedValue(null);
    await expect(adapter.discover()).rejects.toThrow();
    expect(mcpService.requestEventProtocol).toHaveBeenCalledTimes(1);
  });
});
