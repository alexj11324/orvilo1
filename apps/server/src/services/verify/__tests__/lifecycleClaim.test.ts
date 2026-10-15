// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { runVerifyOnCompletion } from '../lifecycle';

vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: vi.fn() }));
vi.mock('@/server/services/aiAgent', () => ({ AiAgentService: class {} }));
vi.mock('@/server/services/aiAgent/deviceQueue', () => ({
  cancelQueuedDeviceOperation: vi.fn(),
  finishQueuedDeviceOperation: vi.fn(),
  readDeviceQueue: vi.fn(),
}));

it('ignores retired lifecycle callbacks without accessing historical rows', async () => {
  const touched = vi.fn();
  const db = new Proxy(
    {},
    {
      get() {
        touched();
        throw new Error('Archive ledger must stay untouched');
      },
    },
  ) as never;
  await expect(runVerifyOnCompletion(db, 'user', {} as never)).resolves.toEqual(undefined);
  expect(touched).not.toHaveBeenCalled();
});
