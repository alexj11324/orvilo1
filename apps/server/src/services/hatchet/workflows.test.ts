// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HATCHET_TASK_NAMES } from './taskNames';
import { cancelHatchetWorkflow, triggerHatchetWorkflow } from './workflows';

const mocks = vi.hoisted(() => ({
  enqueueHatchetTask: vi.fn(),
  getServerDB: vi.fn(),
  insertReturning: vi.fn(),
  insertValues: vi.fn(),
  cancelHatchetTask: vi.fn(),
  selectLimit: vi.fn(),
  selectWhere: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  updateReturning: vi.fn(),
}));

vi.mock('@/libs/hatchet', () => ({
  cancelHatchetTask: mocks.cancelHatchetTask,
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
    mocks.selectLimit.mockResolvedValue([]);
    mocks.insertValues.mockReturnValue({
      onConflictDoNothing: () => ({ returning: mocks.insertReturning }),
    });
    mocks.updateReturning.mockResolvedValue([{ status: 'queued' }]);
    mocks.cancelHatchetTask.mockResolvedValue(undefined);
    mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning });
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
    mocks.getServerDB.mockResolvedValue({
      insert: vi.fn(() => ({ values: mocks.insertValues })),
      update: vi.fn(() => ({ set: mocks.updateSet })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: mocks.selectLimit })),
        })),
      })),
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

  it('does not move a dispatch backwards when the worker wins the publish race', async () => {
    mocks.updateReturning.mockResolvedValueOnce([]);
    mocks.selectLimit.mockResolvedValueOnce([{ status: 'completed' }]);

    await triggerHatchetWorkflow('/api/workflows/agent-signal/run', { userId: 'user-1' });

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'queued', error: null }),
    );
    expect(mocks.updateSet).toHaveBeenCalledWith({
      providerRunId: 'hatchet-run:provider-run',
      updatedAt: expect.any(Date),
    });
    expect(mocks.cancelHatchetTask).not.toHaveBeenCalled();
  });

  it('cancels a provider run when cancellation wins after publish', async () => {
    mocks.updateReturning.mockResolvedValueOnce([]);
    mocks.selectLimit.mockResolvedValueOnce([{ status: 'cancelled' }]);

    await triggerHatchetWorkflow('/api/workflows/agent-signal/run', { userId: 'user-1' });

    expect(mocks.cancelHatchetTask).toHaveBeenCalledWith('hatchet-run:provider-run');
  });

  it('does not cancel or rewrite a completed dispatch', async () => {
    mocks.selectLimit.mockResolvedValueOnce([
      { providerRunId: 'hatchet-run:provider-run', status: 'completed' },
    ]);
    mocks.updateReturning.mockResolvedValueOnce([]);

    await expect(
      cancelHatchetWorkflow('hatchet-dispatch:00000000-0000-4000-8000-000000000010'),
    ).resolves.toBe(false);

    expect(mocks.cancelHatchetTask).not.toHaveBeenCalled();
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
  });
});
