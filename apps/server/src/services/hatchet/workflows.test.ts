// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HATCHET_TASK_NAMES } from './taskNames';
import { triggerHatchetWorkflow } from './workflows';

const mocks = vi.hoisted(() => ({
  enqueueHatchetTask: vi.fn(),
  getServerDB: vi.fn(),
  insertReturning: vi.fn(),
  insertValues: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
}));

vi.mock('@/libs/hatchet', () => ({
  cancelHatchetTask: vi.fn(),
  enqueueHatchetTask: mocks.enqueueHatchetTask,
}));

vi.mock('@/database/server', () => ({ getServerDB: mocks.getServerDB }));

describe('triggerHatchetWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueueHatchetTask.mockResolvedValue('hatchet-run:provider-run');
    mocks.insertReturning.mockResolvedValue([
      { id: '00000000-0000-4000-8000-000000000010', status: 'pending' },
    ]);
    mocks.insertValues.mockReturnValue({
      onConflictDoNothing: () => ({ returning: mocks.insertReturning }),
    });
    mocks.updateWhere.mockResolvedValue(undefined);
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
    mocks.getServerDB.mockResolvedValue({
      insert: vi.fn(() => ({ values: mocks.insertValues })),
      update: vi.fn(() => ({ set: mocks.updateSet })),
    });
  });

  it('stores the private payload in Postgres and sends only opaque ids to Hatchet', async () => {
    const payload = { prompt: 'private text', userId: 'user-1' };

    const result = await triggerHatchetWorkflow('/api/workflows/agent-signal/run', payload, {
      concurrencyKey: 'user-1',
      workflowRunId: 'stable-run',
    });

    expect(result.workflowRunId).toMatch(/^hatchet-dispatch:/);
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        deduplicationKey: expect.stringMatching(/^[a-f\d]{64}$/),
        laneKey: expect.stringMatching(/^[a-f\d]{64}$/),
        payload: {
          body: payload,
          headers: undefined,
          path: '/api/workflows/agent-signal/run',
          workflowRunId: 'stable-run',
        },
      }),
    );
    expect(mocks.enqueueHatchetTask).toHaveBeenCalledWith(HATCHET_TASK_NAMES.workflowDispatch, {
      deduplicationKey: expect.stringMatching(/^[a-f\d]{64}$/),
      dispatchId: expect.any(String),
      laneKey: expect.stringMatching(/^[a-f\d]{64}$/),
    });
    expect(JSON.stringify(mocks.enqueueHatchetTask.mock.calls[0])).not.toContain('private text');
    expect(JSON.stringify(mocks.enqueueHatchetTask.mock.calls[0])).not.toContain('user-1');
  });
});
