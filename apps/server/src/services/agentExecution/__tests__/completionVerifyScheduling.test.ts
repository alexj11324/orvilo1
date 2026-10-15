// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as verifyServices from '@/server/services/verify';

import { CompletionLifecycle } from '../CompletionLifecycle';
import { hookDispatcher } from '../hooks';

const { after } = vi.hoisted(() => ({ after: vi.fn() }));

vi.mock('@/server/utils/scheduleAfterResponse', () => ({ after }));
vi.mock('@/business/server/agent-run/notifyAgentRunCompleted', () => ({
  notifyAgentRunCompleted: vi.fn(async () => {}),
}));
vi.mock('@/server/services/workRegistration', () => ({ registerWorksForOperation: vi.fn() }));

describe('CompletionLifecycle — retired Verify scheduling', () => {
  beforeEach(() => {
    after.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches completion hooks without scheduling the retired Verify gate', async () => {
    const lifecycle = new CompletionLifecycle({} as any, 'user-1');
    vi.spyOn((lifecycle as any).agentOperationModel, 'findById').mockResolvedValue(null);
    vi.spyOn(lifecycle as any, 'persistCompletion').mockResolvedValue(undefined);
    vi.spyOn(hookDispatcher, 'dispatch').mockResolvedValue(undefined as any);
    vi.spyOn(hookDispatcher, 'unregister').mockImplementation(function () {});
    const runVerify = vi
      .spyOn(verifyServices, 'runVerifyOnCompletion')
      .mockResolvedValue(undefined);

    await lifecycle.dispatchHooks(
      'op-1',
      { host: { hooks: [] }, origin: { agentId: 'a' }, status: 'done' },
      'done',
    );

    expect(hookDispatcher.dispatch).toHaveBeenCalledWith(
      'op-1',
      'onComplete',
      expect.any(Object),
      [],
    );
    expect(hookDispatcher.unregister).toHaveBeenCalledWith('op-1');
    expect(after).not.toHaveBeenCalled();
    expect(runVerify).not.toHaveBeenCalled();
  });
});
