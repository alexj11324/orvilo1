import type { Context } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { HATCHET_TASK_NAMES } from '../services/hatchet/taskNames';
import {
  completeHatchetDispatch,
  createWorkflowHatchetTasks,
  enqueueStoredDispatch,
  invokeHonoHandler,
  recoverStaleHatchetDispatches,
  scheduleWorkflowCoordinationRetry,
} from './workflowTasks';

const mocks = vi.hoisted(() => ({
  enqueueHatchetTask: vi.fn().mockResolvedValue('hatchet-schedule:retry'),
  getServerDB: vi.fn(),
}));

vi.mock('@/libs/hatchet', () => ({
  cancelHatchetTask: vi.fn(),
  enqueueHatchetTask: mocks.enqueueHatchetTask,
}));

vi.mock('@/database/server', () => ({ getServerDB: mocks.getServerDB }));

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

describe('recoverStaleHatchetDispatches', () => {
  it('returns expired running dispatches to the pending sweep queue', async () => {
    const returning = vi.fn().mockResolvedValue([{ id: '00000000-0000-4000-8000-000000000005' }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const db = { update: vi.fn().mockReturnValue({ set }) };
    const now = new Date('2026-09-16T20:00:00.000Z');

    await expect(recoverStaleHatchetDispatches(db as never, now)).resolves.toEqual([
      { id: '00000000-0000-4000-8000-000000000005' },
    ]);
    expect(set).toHaveBeenCalledWith({
      error: 'Recovered stale running Hatchet dispatch',
      status: 'pending',
      updatedAt: now,
    });
  });
});

describe('workflow concurrency routing', () => {
  it('registers the serial gate and the shared five-slot capacity together', () => {
    const task = vi.fn((definition) => definition);
    createWorkflowHatchetTasks({ task } as never);
    const dispatch = task.mock.calls.find(
      ([definition]) => definition.name === HATCHET_TASK_NAMES.workflowDispatch,
    )![0];
    expect(dispatch.concurrency).toEqual([
      expect.objectContaining({
        maxRuns: 1,
        expression: 'has(input.serialKey) ? input.serialKey : input.laneKey',
      }),
      expect.objectContaining({ maxRuns: 5, expression: 'input.laneKey' }),
    ]);
    const input = {
      deduplicationKey: 'key',
      dispatchId: '00000000-0000-4000-8000-000000000010',
      laneKey: 'a'.repeat(64),
    };
    expect(dispatch.inputValidator.parse(input)).toEqual(input);
    expect(dispatch.inputValidator.parse({ ...input, serialKey: input.dispatchId }).serialKey).toBe(
      input.dispatchId,
    );
  });

  it('preserves both gates when an exhausted coordination retry is requeued', async () => {
    const id = '00000000-0000-4000-8000-000000000010';
    await scheduleWorkflowCoordinationRetry(
      {
        deduplicationKey: 'topic-run',
        dispatchId: id,
        laneKey: 'a'.repeat(64),
        serialKey: id,
      },
      5,
    );
    expect(mocks.enqueueHatchetTask).toHaveBeenLastCalledWith(
      HATCHET_TASK_NAMES.workflowDispatch,
      {
        coordinationRetry: true,
        deduplicationKey: 'topic-run:coordination:5',
        dispatchId: id,
        laneKey: 'a'.repeat(64),
        serialKey: id,
      },
      { delayMs: 30_000 },
    );
  });

  it.each([
    ['/api/workflows/memory-user-memory/pipelines/chat-topic/process-topic', true],
    ['/api/workflows/agent-signal/run', false],
  ] as const)('restores the concurrency route for durable pending %s', async (path, memory) => {
    const returning = vi.fn().mockResolvedValue([{ status: 'queued' }]);
    const where = vi.fn().mockReturnValue({ returning });
    mocks.getServerDB.mockResolvedValue({
      update: vi.fn(() => ({ set: vi.fn(() => ({ where })) })),
    });
    const id = '00000000-0000-4000-8000-000000000010';
    await enqueueStoredDispatch({
      id,
      laneKey: 'a'.repeat(64),
      payload: { path, workflowRunId: 'run-1', body: {} },
    } as never);
    const input = mocks.enqueueHatchetTask.mock.calls.at(-1)![1];
    expect(input.laneKey).toBe('a'.repeat(64));
    if (memory) expect(input.serialKey).toBe(id);
    else expect(input).not.toHaveProperty('serialKey');
  });
});
