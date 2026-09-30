import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskStore } from '@/store/task';

import { TaskTitleSaveQueue } from './taskTitleSaveQueue';
import { useTaskTitleAutosave } from './useTaskTitleAutosave';

type UpdateTask = TaskStore['updateTask'];

const makeUpdateTask = () =>
  vi.fn(
    async (_id: string, _data: { name: string }): Promise<void> => {},
  ) as unknown as UpdateTask & ReturnType<typeof vi.fn>;

const renderAutosave = (props: {
  editable?: boolean;
  queue: TaskTitleSaveQueue;
  taskId?: string;
  updateTask: UpdateTask;
}) => {
  const { editable = true, queue, taskId, updateTask } = props;
  return renderHook(
    ({ taskId: currentTaskId }) =>
      useTaskTitleAutosave({ editable, queue, taskId: currentTaskId, updateTask }),
    { initialProps: { taskId } },
  );
};

describe('useTaskTitleAutosave', () => {
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

  it('flushes the bound task on unmount — the last character is not dropped', async () => {
    const { result, unmount } = renderAutosave({ queue, taskId: 'task-a', updateTask });

    result.current.notifyTitleEdit('typed late');
    unmount();

    await vi.waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));
    expect(updateTask).toHaveBeenCalledWith('task-a', { name: 'typed late' });
  });

  it('flushes the previous task when the bound taskId switches', async () => {
    const { result, rerender } = renderAutosave({ queue, taskId: 'task-a', updateTask });

    result.current.notifyTitleEdit('A draft');
    rerender({ taskId: 'task-b' });

    await vi.waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));
    expect(updateTask).toHaveBeenCalledWith('task-a', { name: 'A draft' });
    expect(updateTask).not.toHaveBeenCalledWith('task-b', expect.anything());
  });

  it('never schedules a save when the input is not editable or unbound', async () => {
    const unbound = renderAutosave({ queue, taskId: undefined, updateTask });
    unbound.result.current.notifyTitleEdit('x');

    const disabled = renderAutosave({ editable: false, queue, taskId: 'task-a', updateTask });
    disabled.result.current.notifyTitleEdit('x');
    await vi.advanceTimersByTimeAsync(1000);

    expect(updateTask).not.toHaveBeenCalled();
    expect(queue.hasPending('task-a')).toBe(false);
  });
});
