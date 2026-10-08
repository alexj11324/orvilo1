import { describe, expect, it, vi } from 'vitest';

import { runWithRollback } from './runWithRollback';

describe('runWithRollback', () => {
  it('keeps the new value when the save succeeds', async () => {
    const rollback = vi.fn();
    const onError = vi.fn();

    await expect(runWithRollback(async () => 'ok', rollback, onError)).resolves.toBe(true);

    expect(rollback).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('rolls back and reports when the save rejects', async () => {
    const failure = new Error('ipc failed');
    const rollback = vi.fn();
    const onError = vi.fn();

    await expect(runWithRollback(() => Promise.reject(failure), rollback, onError)).resolves.toBe(
      false,
    );

    expect(rollback).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it('rolls back when the commit throws synchronously', async () => {
    const rollback = vi.fn();

    await runWithRollback(
      () => {
        throw new Error('sync');
      },
      rollback,
      vi.fn(),
    );

    expect(rollback).toHaveBeenCalledTimes(1);
  });
});
