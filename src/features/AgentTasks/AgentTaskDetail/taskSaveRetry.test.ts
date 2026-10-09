import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TaskStore } from '@/store/task';

import { hasTaskSaveRetry, retryFailedTaskSave, runTrackedDescriptionSave } from './taskSaveRetry';

const updateTask = vi.fn() as unknown as TaskStore['updateTask'];

const deferredSave = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
};

describe('description save retry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('re-sends a failed description write as an external write via header Retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = vi
      .fn<(retrying: boolean) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);

    await runTrackedDescriptionSave('T-1', send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith(false);

    retryFailedTaskSave('T-1', updateTask);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send).toHaveBeenLastCalledWith(true);

    // Resolved: a second Retry has nothing left to send.
    retryFailedTaskSave('T-1', updateTask);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('keeps the retry armed when the re-send fails again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = vi
      .fn<(retrying: boolean) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('still offline'))
      .mockResolvedValue(undefined);

    await runTrackedDescriptionSave('T-2', send);
    retryFailedTaskSave('T-2', updateTask);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    retryFailedTaskSave('T-2', updateTask);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(3));
  });

  it('does not retry an older edit that fails after the newer edit succeeds', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const older = deferredSave();
    const newer = deferredSave();
    const sendOlder = vi.fn().mockReturnValueOnce(older.promise).mockResolvedValue(undefined);
    const sendNewer = vi.fn().mockReturnValueOnce(newer.promise).mockResolvedValue(undefined);
    const savingOlder = runTrackedDescriptionSave('retry-newer-success', sendOlder);
    const savingNewer = runTrackedDescriptionSave('retry-newer-success', sendNewer);

    newer.resolve();
    await savingNewer;
    older.reject(new Error('older offline'));
    await savingOlder;

    retryFailedTaskSave('retry-newer-success', updateTask);
    expect(sendOlder).toHaveBeenCalledTimes(1);
    expect(sendNewer).toHaveBeenCalledTimes(1);
    expect(hasTaskSaveRetry('retry-newer-success')).toBe(false);
  });

  it('keeps the newer failed edit retry when an older edit succeeds late', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const older = deferredSave();
    const newer = deferredSave();
    const sendOlder = vi.fn().mockReturnValueOnce(older.promise).mockResolvedValue(undefined);
    const sendNewer = vi.fn().mockReturnValueOnce(newer.promise).mockResolvedValue(undefined);
    const savingOlder = runTrackedDescriptionSave('retry-newer-failure', sendOlder);
    const savingNewer = runTrackedDescriptionSave('retry-newer-failure', sendNewer);

    newer.reject(new Error('newer offline'));
    await savingNewer;
    older.resolve();
    await savingOlder;

    expect(hasTaskSaveRetry('retry-newer-failure')).toBe(true);
    retryFailedTaskSave('retry-newer-failure', updateTask);
    expect(sendNewer).toHaveBeenCalledTimes(2);
    expect(sendNewer).toHaveBeenLastCalledWith(true);
    expect(sendOlder).toHaveBeenCalledTimes(1);
  });

  it('drops an old retry as soon as a newer edit starts saving', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sendOlder = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    await runTrackedDescriptionSave('retry-newer-pending', sendOlder);
    expect(hasTaskSaveRetry('retry-newer-pending')).toBe(true);

    const newer = deferredSave();
    const sendNewer = vi.fn().mockReturnValueOnce(newer.promise).mockResolvedValue(undefined);
    const savingNewer = runTrackedDescriptionSave('retry-newer-pending', sendNewer);
    retryFailedTaskSave('retry-newer-pending', updateTask);
    expect(sendOlder).toHaveBeenCalledTimes(1);
    expect(hasTaskSaveRetry('retry-newer-pending')).toBe(false);

    newer.reject(new Error('newer offline'));
    await savingNewer;
    retryFailedTaskSave('retry-newer-pending', updateTask);
    expect(sendNewer).toHaveBeenCalledTimes(2);
    expect(sendNewer).toHaveBeenLastCalledWith(true);
  });

  it('keeps edit ordering independent for different tasks', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = deferredSave();
    const sendFirst = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const savingFirst = runTrackedDescriptionSave('retry-task-first', sendFirst);
    await runTrackedDescriptionSave('retry-task-second', async () => {});
    first.reject(new Error('offline'));
    await savingFirst;

    expect(hasTaskSaveRetry('retry-task-first')).toBe(true);
    retryFailedTaskSave('retry-task-first', updateTask);
    expect(sendFirst).toHaveBeenCalledTimes(2);
    expect(sendFirst).toHaveBeenLastCalledWith(true);
  });
});
