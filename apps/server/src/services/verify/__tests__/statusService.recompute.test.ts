// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { VerifyStatusService } from '../statusService';

vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: vi.fn() }));
vi.mock('@/server/services/aiAgent', () => ({ AiAgentService: class {} }));
vi.mock('@/server/services/aiAgent/deviceQueue', () => ({
  cancelQueuedDeviceOperation: vi.fn(),
  finishQueuedDeviceOperation: vi.fn(),
  readDeviceQueue: vi.fn(),
}));

it('rejects the retired statusService producer before reading or writing the ledger', async () => {
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
  await expect(new VerifyStatusService(db, 'user').recompute('operation')).rejects.toMatchObject({
    code: 'PRECONDITION_FAILED',
  });
  expect(touched).not.toHaveBeenCalled();
});
