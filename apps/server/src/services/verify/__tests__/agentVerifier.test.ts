// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { createVerifierAgentRunner } from '../agentVerifier';

vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: vi.fn() }));
vi.mock('@/server/services/aiAgent', () => ({ AiAgentService: class {} }));
vi.mock('@/server/services/aiAgent/deviceQueue', () => ({
  cancelQueuedDeviceOperation: vi.fn(),
  finishQueuedDeviceOperation: vi.fn(),
  readDeviceQueue: vi.fn(),
}));

it('rejects the retired agentVerifier producer before reading or writing the ledger', async () => {
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
  expect(() => createVerifierAgentRunner({ db, userId: 'user', deliverable: '' })).toThrow(
    'Standalone Acceptance/Verify is retired',
  );
  expect(touched).not.toHaveBeenCalled();
});
