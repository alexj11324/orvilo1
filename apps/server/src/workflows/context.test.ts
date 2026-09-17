import { describe, expect, it, vi } from 'vitest';

import {
  createWorkflowContext,
  WorkflowNonRetryableError,
  WorkflowStepInProgressError,
  type WorkflowStepStore,
} from './context';

const createMemoryStepStore = (): WorkflowStepStore => {
  const values = new Map<
    string,
    {
      ownerToken: string;
      result: unknown;
      resultIsUndefined: boolean;
      status: 'completed' | 'running';
    }
  >();

  return {
    acquire: async (stepName, ownerToken) => {
      const existing = values.get(stepName);
      if (!existing) {
        values.set(stepName, {
          ownerToken,
          result: undefined,
          resultIsUndefined: true,
          status: 'running',
        });
        return { status: 'acquired' };
      }
      if (existing.status === 'completed') {
        return {
          result: existing.result,
          resultIsUndefined: existing.resultIsUndefined,
          status: 'completed' as const,
        };
      }
      return { status: 'busy' };
    },
    complete: async (stepName, ownerToken, result) => {
      const existing = values.get(stepName);
      if (!existing || existing.ownerToken !== ownerToken || existing.status !== 'running') {
        throw new Error(`step ownership lost: ${stepName}`);
      }
      values.set(stepName, {
        ownerToken,
        result,
        resultIsUndefined: result === undefined,
        status: 'completed',
      });
    },
    release: async (stepName, ownerToken) => {
      const existing = values.get(stepName);
      if (existing?.ownerToken === ownerToken && existing.status === 'running') {
        values.delete(stepName);
      }
    },
    renew: async (stepName, ownerToken) =>
      values.get(stepName)?.ownerToken === ownerToken && values.get(stepName)?.status === 'running',
  };
};

describe('createWorkflowContext', () => {
  it('reuses completed steps after a later step fails and the task retries', async () => {
    const store = createMemoryStepStore();
    const context = createWorkflowContext({}, undefined, 'run-1', { stepStore: store });
    const firstStep = vi.fn().mockResolvedValue({ generated: 'value' });
    const secondStep = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValue('done');

    await expect(context.run('first', firstStep)).resolves.toEqual({ generated: 'value' });
    await expect(context.run('second', secondStep)).rejects.toThrow('temporary');
    await expect(context.run('first', firstStep)).resolves.toEqual({ generated: 'value' });
    await expect(context.run('second', secondStep)).resolves.toBe('done');

    expect(firstStep).toHaveBeenCalledOnce();
    expect(secondStep).toHaveBeenCalledTimes(2);
  });

  it('stores undefined as a completed result so retries do not execute it again', async () => {
    const store = createMemoryStepStore();
    const context = createWorkflowContext({}, undefined, 'run-2', { stepStore: store });
    const callback = vi.fn().mockResolvedValue(undefined);

    await context.run('noop', callback);
    await context.run('noop', callback);

    expect(callback).toHaveBeenCalledOnce();
  });

  it('blocks a concurrent retry while the first attempt owns the step', async () => {
    const store = createMemoryStepStore();
    const firstContext = createWorkflowContext({}, undefined, 'run-owner-1', { stepStore: store });
    const retryContext = createWorkflowContext({}, undefined, 'run-owner-2', { stepStore: store });
    let resolveFirst!: (value: string) => void;
    const firstStep = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const retryStep = vi.fn().mockResolvedValue('duplicate');

    const firstRun = firstContext.run('side-effect', firstStep);
    await Promise.resolve();
    await expect(retryContext.run('side-effect', retryStep)).rejects.toBeInstanceOf(
      WorkflowStepInProgressError,
    );

    resolveFirst('stored');
    await expect(firstRun).resolves.toBe('stored');
    await expect(retryContext.run('side-effect', retryStep)).resolves.toBe('stored');
    expect(retryStep).not.toHaveBeenCalled();
  });

  it('rejects an oversized dynamic step name before touching the callback', async () => {
    const context = createWorkflowContext({});
    const callback = vi.fn().mockResolvedValue('unused');

    await expect(context.run('x'.repeat(257), callback)).rejects.toBeInstanceOf(
      WorkflowNonRetryableError,
    );
    expect(callback).not.toHaveBeenCalled();
  });
});
