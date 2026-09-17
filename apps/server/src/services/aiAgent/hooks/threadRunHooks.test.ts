// @vitest-environment node
import { ThreadStatus } from '@orvilo/types';
import { describe, expect, it, vi } from 'vitest';

import { completeThreadRun, updateThreadRunProgress } from './threadRunHooks';

describe('durable thread run updates', () => {
  it('persists queue-worker progress from the durable agent state', async () => {
    const updateRunProgress = vi.fn().mockResolvedValue(undefined);
    const state = {
      messages: [{ role: 'user' }, { role: 'assistant' }],
      operationId: 'op-1',
      usage: { llm: { tokens: { total: 42 } }, tools: { totalCalls: 3 } },
    } as any;

    await updateThreadRunProgress(
      { updateRunProgress } as any,
      'thread-1',
      '2026-09-16T00:00:00.000Z',
      state,
    );

    expect(updateRunProgress).toHaveBeenCalledWith('thread-1', {
      operationId: 'op-1',
      startedAt: '2026-09-16T00:00:00.000Z',
      totalMessages: 2,
      totalTokens: 42,
      totalToolCalls: 3,
    });
  });

  it('does not replace a durable message count when Redis omitted messages', async () => {
    const updateRunProgress = vi.fn().mockResolvedValue(undefined);
    await updateThreadRunProgress(
      { updateRunProgress } as any,
      'thread-1',
      '2026-09-16T00:00:00.000Z',
      { operationId: 'op-1', usage: { tools: { totalCalls: 3 } } } as any,
    );

    expect(updateRunProgress).toHaveBeenCalledWith(
      'thread-1',
      expect.not.objectContaining({ totalMessages: expect.anything() }),
    );
  });

  it('persists the final assistant summary and terminal thread status', async () => {
    const completeRun = vi.fn().mockResolvedValue(undefined);
    const messageUpdate = vi.fn().mockResolvedValue(undefined);
    const finalState = {
      cost: { total: 0.04 },
      error: { message: 'model failed', type: 'provider_error' },
      messages: [
        { content: 'older answer', role: 'assistant' },
        { content: 'request', role: 'user' },
        { content: 'final answer', role: 'assistant' },
      ],
      operationId: 'op-1',
      usage: { llm: { tokens: { total: 17 } }, tools: { totalCalls: 2 } },
    } as any;

    await completeThreadRun({ completeRun } as any, { update: messageUpdate } as any, {
      finalState,
      reason: 'error',
      sourceMessageId: 'message-1',
      startedAt: new Date(Date.now() - 1000).toISOString(),
      threadId: 'thread-1',
    });

    expect(messageUpdate).toHaveBeenCalledWith('message-1', { content: 'final answer' });
    expect(completeRun).toHaveBeenCalledWith(
      'thread-1',
      ThreadStatus.Failed,
      expect.objectContaining({
        completedAt: expect.any(String),
        duration: expect.any(Number),
        operationId: 'op-1',
        totalCost: 0.04,
        totalMessages: 3,
        totalTokens: 17,
        totalToolCalls: 2,
      }),
    );
  });
});
