import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TaskStore } from '@/store/task';

import { retryFailedTaskSave, runTrackedDescriptionSave } from './taskSaveRetry';

const updateTask = vi.fn() as unknown as TaskStore['updateTask'];

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
});
