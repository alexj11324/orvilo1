import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type * as DeviceIdentityModule from '@orvilo/device-identity';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  mintWorkspaceConnectToken,
  resolveDeviceIdentity,
  resolveWorkspaceDeviceIdentity,
} from './register';

vi.mock('@orvilo/device-identity', async (importOriginal) => ({
  ...(await importOriginal<typeof DeviceIdentityModule>()),
  resolvePersistentDeviceIdentity: vi.fn(async (principal: string) => ({
    deviceId: `persistent:${principal}`,
    identitySource: 'fallback',
  })),
}));

describe('persistent device identity', () => {
  it('reuses the shared personal fallback across resolutions', async () => {
    const expected = { deviceId: 'persistent:user-1', identitySource: 'fallback' };
    expect(await resolveDeviceIdentity('user-1')).toEqual(expected);
    expect(await resolveDeviceIdentity('user-1')).toEqual(expected);
  });

  it('uses the shared workspace principal without a channel seed', async () => {
    expect(await resolveWorkspaceDeviceIdentity('workspace-1')).toEqual({
      deviceId: 'persistent:workspace:workspace-1',
      identitySource: 'fallback',
    });
    expect(await resolveWorkspaceDeviceIdentity('workspace-2')).toEqual({
      deviceId: 'persistent:workspace:workspace-2',
      identitySource: 'fallback',
    });
  });

  it('preserves explicit IDs and missing personal principals', async () => {
    const expected = { deviceId: 'pinned-device', identitySource: 'fallback' };
    expect(await resolveDeviceIdentity(undefined, 'pinned-device')).toEqual(expected);
    expect(await resolveWorkspaceDeviceIdentity('workspace-1', 'pinned-device')).toEqual(expected);
    expect(await resolveDeviceIdentity(undefined)).toBeUndefined();
  });
});

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe('mintWorkspaceConnectToken', () => {
  it('recovers from a transient network failure', async () => {
    let attempts = 0;
    const server = createServer((request, response) => {
      attempts += 1;
      if (attempts === 1) {
        request.socket.destroy();
        return;
      }

      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          result: {
            data: {
              json: { token: 'workspace-token', workspaceId: 'workspace-id' },
            },
          },
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    const result = await mintWorkspaceConnectToken(
      {
        serverUrl: `http://127.0.0.1:${port}`,
        token: 'user-token',
        tokenType: 'jwt',
      },
      'workspace-id',
    );

    expect(result).toEqual({ token: 'workspace-token', workspaceId: 'workspace-id' });
    expect(attempts).toBe(2);
  });
});
