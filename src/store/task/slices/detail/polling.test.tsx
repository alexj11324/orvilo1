// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { taskService } from '@/services/task';

import { useTaskStore } from '../../store';

vi.mock('@/services/task', () => ({ taskService: { getDetail: vi.fn() } }));
vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => undefined,
}));
vi.mock('@lobehub/ui/base-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...(await import('~base-ui-stubs')).baseUiStubs,
}));

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('task detail shared polling', () => {
  it('deduplicates staggered page/drawer subscriptions without skipping the next idle tick', async () => {
    vi.useFakeTimers();
    const detail = {
      id: 'task-1',
      identifier: 'T-1',
      instruction: 'Task',
      status: 'backlog',
      dependencies: [],
    } as any;
    // The action's fetcher captures its own instance method, not the copy on
    // the store. Observe the actual service boundary while leaving SWR real.
    vi.mocked(taskService.getDetail).mockResolvedValue({ data: detail } as any);
    useTaskStore.setState({ taskDetailMap: { 'T-1': detail } });
    const cache = new Map();
    const wrapper = ({ children }: PropsWithChildren) =>
      createElement(
        SWRConfig,
        {
          value: { provider: () => cache, isVisible: () => true, isOnline: () => true },
        },
        children,
      );
    const page = renderHook(() => useTaskStore.getState().useFetchTaskDetail('T-1'), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(taskService.getDetail).toHaveBeenCalledExactlyOnceWith('T-1');
    const drawer = renderHook(() => useTaskStore.getState().useFetchTaskDetail('T-1'), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(taskService.getDetail).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(taskService.getDetail).toHaveBeenCalledTimes(2);
    page.unmount();
    drawer.unmount();
  });
});
