import type { Context } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { HATCHET_TASK_NAMES } from '../services/hatchet/taskNames';
import {
  completeHatchetDispatch,
  invokeHonoHandler,
  scheduleWorkflowCoordinationRetry,
} from './workflowTasks';

const mocks = vi.hoisted(() => ({
  enqueueHatchetTask: vi.fn().mockResolvedValue('hatchet-schedule:retry'),
}));

vi.mock('@/libs/hatchet', () => ({
  cancelHatchetTask: vi.fn(),
  enqueueHatchetTask: mocks.enqueueHatchetTask,
}));

describe('invokeHonoHandler', () => {
  it('adapts a stored workflow payload to the Hono request contract', async () => {
    const result = await invokeHonoHandler(
      async (context: Context) => {
        const body = await context.req.json();
        return context.json({ body });
      },
      {
        body: { operationId: 'op-1' },
        dispatchId: '00000000-0000-4000-8000-000000000001',
        headers: { 'X-Trace': 'trace-1' },
        workflowRunId: 'run-1',
      },
    );

    expect(result).toEqual({ body: { operationId: 'op-1' } });
  });

  it('surfaces non-success responses for Hatchet retry handling', async () => {
    await expect(
      invokeHonoHandler(async (context: Context) => context.json({ error: 'temporary' }, 503), {
        body: {},
        dispatchId: '00000000-0000-4000-8000-000000000002',
        workflowRunId: 'run-2',
      }),
    ).rejects.toThrow('temporary');
  });

  it('schedules a successor without consuming the active dispatch row', async () => {
    await scheduleWorkflowCoordinationRetry(
      {
        deduplicationKey: 'dispatch-key',
        dispatchId: '00000000-0000-4000-8000-000000000003',
        laneKey: 'a'.repeat(64),
      },
      5,
    );

    expect(mocks.enqueueHatchetTask).toHaveBeenCalledWith(
      HATCHET_TASK_NAMES.workflowDispatch,
      {
        coordinationRetry: true,
        deduplicationKey: 'dispatch-key:coordination:5',
        dispatchId: '00000000-0000-4000-8000-000000000003',
        laneKey: 'a'.repeat(64),
      },
      { delayMs: 30_000 },
    );
  });
});

describe('completeHatchetDispatch', () => {
  it('preserves checkpoints when a recovery transition won the race', async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const db = { update: vi.fn().mockReturnValue({ set }) };
    const clearStepResults = vi.fn().mockResolvedValue(undefined);

    await expect(
      completeHatchetDispatch(
        db as never,
        '00000000-0000-4000-8000-000000000004',
        clearStepResults,
      ),
    ).resolves.toBe(false);
    expect(clearStepResults).not.toHaveBeenCalled();

    expect(set).toHaveBeenCalledWith({
      error: null,
      status: 'completed',
      updatedAt: expect.any(Date),
    });
  });
});
