// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { sweepStuckVerifyRuns } from '../sweep';

vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: vi.fn() }));
vi.mock('@/server/services/aiAgent', () => ({ AiAgentService: class {} }));
vi.mock('@/server/services/aiAgent/deviceQueue', () => ({
  cancelQueuedDeviceOperation: vi.fn(),
  finishQueuedDeviceOperation: vi.fn(),
  readDeviceQueue: vi.fn(),
}));

it('ignores retired sweep callbacks without accessing historical rows', async () => {
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
  await expect(sweepStuckVerifyRuns(db)).resolves.toEqual({
    abandoned: [],
    settled: [],
    skipped: 0,
  });
  expect(touched).not.toHaveBeenCalled();
});
