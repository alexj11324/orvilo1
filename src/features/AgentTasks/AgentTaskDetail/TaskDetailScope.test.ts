/**
 * @vitest-environment happy-dom
 */
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { taskDetailSelectors } from '@/store/task/selectors';

import { TaskDetailScope, useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';

const mocks = vi.hoisted(() => ({
  taskState: {} as any,
}));

vi.mock('@/store/task', () => {
  const useTaskStore = (selector?: any) =>
    selector === undefined ? mocks.taskState : selector(mocks.taskState);
  useTaskStore.getState = () => mocks.taskState;
  return { useTaskStore };
});

const probe = () => {
  const taskId = useTaskDetailTaskId();
  const name = useTaskDetailSelector(taskDetailSelectors.taskName);
  return `${taskId}:${name ?? ''}`;
};

const scope = (taskId?: string) => {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(TaskDetailScope, { children, taskId });
  return wrapper;
};

describe('TaskDetailScope', () => {
  beforeEach(() => {
    mocks.taskState = {
      activeTaskId: 'T-B',
      taskDetailMap: {
        'T-A': { name: 'Alpha' },
        'T-B': { name: 'Beta' },
      },
    };
  });

  it('binds the subtree to the scope taskId even when activeTaskId points elsewhere', () => {
    const { result } = renderHook(probe, { wrapper: scope('T-A') });
    expect(result.current).toBe('T-A:Alpha');
  });

  it('falls back to the global activeTaskId outside a scope', () => {
    const { result } = renderHook(probe);
    expect(result.current).toBe('T-B:Beta');
  });

  it('keeps reading task A after the global slot is claimed by task B — no cross-talk', () => {
    mocks.taskState.activeTaskId = 'T-A';
    const { result, rerender } = renderHook(probe, { wrapper: scope('T-A') });
    expect(result.current).toBe('T-A:Alpha');

    // A second detail host mounts and steals the shared activeTaskId slot.
    mocks.taskState.activeTaskId = 'T-B';
    rerender();

    expect(result.current).toBe('T-A:Alpha');
  });

  it('lets the innermost scope win when hosts nest', () => {
    const outer = scope('T-A');
    const { result } = renderHook(probe, {
      wrapper: ({ children }) =>
        outer({ children: createElement(TaskDetailScope, { children, taskId: 'T-B' }) }),
    });
    expect(result.current).toBe('T-B:Beta');
  });
});
