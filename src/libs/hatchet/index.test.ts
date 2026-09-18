// @vitest-environment node
import { HatchetClient, IdempotencyCollisionError } from '@hatchet-dev/typescript-sdk/v1/index.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { enqueueHatchetTask, resetHatchetClientForTests } from './index';

describe('enqueueHatchetTask', () => {
  beforeEach(() => {
    vi.stubEnv('HATCHET_CLIENT_TOKEN', 'test-token');
    resetHatchetClientForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetHatchetClientForTests();
  });

  it('recovers the accepted run id after an idempotency collision', async () => {
    const runNoWait = vi.fn().mockRejectedValue(new IdempotencyCollisionError('existing-run-id'));
    vi.spyOn(HatchetClient, 'init').mockReturnValue({ runNoWait } as unknown as HatchetClient);

    await expect(
      enqueueHatchetTask('workflow-dispatch', { deduplicationKey: 'stable-key' }),
    ).resolves.toBe('hatchet-run:existing-run-id');
  });

  it('still surfaces non-collision provider failures', async () => {
    const runNoWait = vi.fn().mockRejectedValue(new Error('provider unavailable'));
    vi.spyOn(HatchetClient, 'init').mockReturnValue({ runNoWait } as unknown as HatchetClient);

    await expect(enqueueHatchetTask('workflow-dispatch', {})).rejects.toThrow(
      'provider unavailable',
    );
  });
});
