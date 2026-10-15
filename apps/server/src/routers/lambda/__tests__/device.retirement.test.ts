// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deviceRouter } from '../device';

const { call, probe } = vi.hoisted(() => ({
  call: vi.fn(async () => ({ success: true, content: 'third-party result' })),
  probe: vi.fn(async () => ({ data: { json: { api: [], identifier: 'arbitrary' } } })),
}));
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: () => ({}) }));
vi.mock('@/database/models/device', () => ({
  DeviceModel: class {
    findByDeviceId = async () => ({ deviceId: 'owned' });
  },
}));
vi.mock('@/database/models/user', () => ({ UserModel: { findByIds: async () => [] } }));
vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: {
    callDeviceMcpTool: call,
    mcpCheckInstallable: probe,
    mcpGetStdioManifest: probe,
    mcpGetStreamableManifest: probe,
  },
}));

describe('retired platform device MCP APIs', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [
      'callMcpTool',
      {
        apiName: 'readFile',
        arguments: '{}',
        identifier: 'arbitrary',
        params: { type: 'stdio', command: 'third-party-mcp', args: [], name: 'arbitrary' },
      },
    ],
    ['getStdioMcpServerManifest', { input: { command: 'third-party-mcp', name: 'arbitrary' } }],
    [
      'getStreamableMcpServerManifest',
      { input: { identifier: 'arbitrary', url: 'http://localhost:3000/mcp' } },
    ],
    ['checkMcpInstallable', { deploymentOptions: [] }],
  ] as const)('rejects %s before forwarding or spawning', async (method, input) => {
    const caller = deviceRouter.createCaller({ userId: 'owner' } as never) as unknown as Record<
      string,
      (input: unknown) => Promise<unknown>
    >;
    await expect(caller[method]({ deviceId: 'owned', ...input })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(call).not.toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();
  });
});
