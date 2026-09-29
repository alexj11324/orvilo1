import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskStore } from '@/store/task';

import { TaskTitleSaveQueue } from './taskTitleSaveQueue';

type UpdateTask = TaskStore['updateTask'];

const DEBOUNCE_MS = 300;

const makeUpdateTask = () =>
  vi.fn(
    async (_id: string, _data: { name: string }): Promise<void> => {},
  ) as unknown as UpdateTask & ReturnType<typeof vi.fn>;

describe('TaskTitleSaveQueue', () => {
  let queue: TaskTitleSaveQueue;
  let updateTask: ReturnType<typeof makeUpdateTask>;

  beforeEach(() => {
    vi.useFakeTimers();
    queue = new TaskTitleSaveQueue();
    updateTask = makeUpdateTask();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces a burst into a single save of the newest value', async () => {
    queue.schedule('task-a', 't1', updateTask);
    queue.schedule('task-a', 't12', updateTask);
    queue.schedule('task-a', 't123', updateTask);

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1);
    expect(updateTask).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(updateTask).toHaveBeenCalledTimes(1);
    expect(updateTask).toHaveBeenCalledWith('task-a', { name: 't123' });
    expect(queue.hasPending('task-a')).toBe(false);
  });

  it('saves under the input-time taskId even after the host switched to a cached task', async () => {
    queue.schedule('task-a', 'title for A', updateTask);

    // The detail view swaps A -> B inside the debounce window and the
    // outgoing host flushes its pending edit on the way out.
    queue.flush('task-a', updateTask);
    await vi.waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));

    expect(updateTask).toHaveBeenCalledWith('task-a', { name: 'title for A' });
    expect(updateTask).not.toHaveBeenCalledWith('task-b', expect.anything());
  });

  it('still targets task A when the timer fires after the host unmounted for an uncached task', async () => {
    queue.schedule('task-a', 'title for A', updateTask);

    // No host is left to flush: A's detail was evicted when B mounted. The
    // queue's own timer still fires the save for the task the user typed in.
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(updateTask).toHaveBeenCalledTimes(1);
    expect(updateTask).toHaveBeenCalledWith('task-a', { name: 'title for A' });
    expect(updateTask).not.toHaveBeenCalledWith('task-b', expect.anything());
  });

  it('keeps per-task queues independent across an A/B/A round trip', async () => {
    queue.schedule('task-a', 'a-v1', updateTask);
    queue.flush('task-a', updateTask); // switch A -> B
    await vi.waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));

    queue.schedule('task-b', 'b-v1', updateTask);
    queue.flush('task-b', updateTask); // switch B -> A
    await vi.waitFor(() => expect(updateTask).toHaveBeenCalledTimes(2));

    queue.schedule('task-a', 'a-v2', updateTask);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(
      updateTask.mock.calls.map(([id, data]) => [id, (data as { name: string }).name]),
    ).toEqual([
      ['task-a', 'a-v1'],
      ['task-b', 'b-v1'],
      ['task-a', 'a-v2'],
    ]);
    expect(queue.hasPending('task-a')).toBe(false);
    expect(queue.hasPending('task-b')).toBe(false);
  });

  it('fires the pending save on flush so the last character survives navigation', async () => {
    queue.schedule('task-a', 'final char', updateTask);
    queue.flush('task-a', updateTask);
    await vi.waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));

    expect(updateTask).toHaveBeenCalledWith('task-a', { name: 'final char' });
  });

  it('ignores a stale edit sequence: an edit typed mid-flight supersedes the in-flight save', async () => {
    let resolveFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    updateTask.mockImplementationOnce(() => first);

    queue.schedule('task-a', 'a-v1', updateTask);
    queue.flush('task-a', updateTask);
    await vi.waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));
    expect(queue.hasPending('task-a')).toBe(true);

    // A newer edit lands while v1 is on the wire — it must not start a
    // parallel save (serialized) but must fire the moment v1 settles.
    queue.schedule('task-a', 'a-v2', updateTask);
    resolveFirst();
    await vi.waitFor(() => expect(updateTask).toHaveBeenCalledTimes(2));

    expect(updateTask).toHaveBeenNthCalledWith(1, 'task-a', { name: 'a-v1' });
    expect(updateTask).toHaveBeenNthCalledWith(2, 'task-a', { name: 'a-v2' });
    await vi.waitFor(() => expect(queue.hasPending('task-a')).toBe(false));
  });

  it('keeps the draft after a failed save and retries it', async () => {
    updateTask.mockRejectedValueOnce(new Error('network down'));

    queue.schedule('task-a', 'unsent title', updateTask);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await vi.waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));

    // Draft retained — flagged as pending so hosts keep the user's text.
    expect(queue.hasPending('task-a')).toBe(true);

    // Automatic retry reissues the same task-bound edit.
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await vi.waitFor(() => expect(updateTask).toHaveBeenCalledTimes(2));
    expect(updateTask).toHaveBeenNthCalledWith(2, 'task-a', { name: 'unsent title' });
    await vi.waitFor(() => expect(queue.hasPending('task-a')).toBe(false));
  });

  it('stops auto-retrying after the retry budget but never drops the draft', async () => {
    updateTask.mockRejectedValue(new Error('offline'));

    queue.schedule('task-a', 'doomed title', updateTask);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    }

    // 1 initial + 3 retries, then the queue goes quiet — the edit stays
    // pending so a later flush/keystroke can still deliver it.
    expect(updateTask).toHaveBeenCalledTimes(4);
    expect(queue.hasPending('task-a')).toBe(true);

    updateTask.mockResolvedValue(undefined);
    queue.flush('task-a', updateTask);
    await vi.waitFor(() => expect(updateTask).toHaveBeenCalledTimes(5));
    expect(updateTask).toHaveBeenLastCalledWith('task-a', { name: 'doomed title' });
    await vi.waitFor(() => expect(queue.hasPending('task-a')).toBe(false));
  });

  it('isolates a failing save to its own task', async () => {
    updateTask.mockImplementation(async (id: string) => {
      if (id === 'task-a') throw new Error('nope');
    });

    queue.schedule('task-a', 'a', updateTask);
    queue.schedule('task-b', 'b', updateTask);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await vi.waitFor(() => expect(updateTask).toHaveBeenCalledTimes(2));

    expect(updateTask).toHaveBeenCalledWith('task-b', { name: 'b' });
    expect(queue.hasPending('task-a')).toBe(true);
    expect(queue.hasPending('task-b')).toBe(false);
  });
});
