import { afterEach, expect, it, vi } from 'vitest';

import { getTestDeviceId } from '../../support/seedTestUser';
import { startFakeGateway } from './server';

afterEach(() => vi.unstubAllGlobals());

it('lists each caller personal fixture device before its first dispatch', async () => {
  let handle: (request: Request) => Response | Promise<Response>;
  vi.stubGlobal('Bun', {
    serve: (options: { fetch: typeof handle }) => {
      handle = options.fetch;
      return {};
    },
  });
  startFakeGateway(0);
  const list = async (userId: string) => {
    const response = await handle(
      new Request('http://gateway.test/api/device/devices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      }),
    );
    return (await response.json()).devices;
  };
  const first = await list('retained-user');
  const second = await list('new-user');
  expect(first).toHaveLength(1);
  expect(second).toHaveLength(1);
  expect(first[0].deviceId).toBe(getTestDeviceId('retained-user'));
  expect(second[0].deviceId).toBe(getTestDeviceId('new-user'));
  expect(first[0].deviceId).not.toBe(second[0].deviceId);
  expect((await list('retained-user'))[0].deviceId).toBe(first[0].deviceId);
});
