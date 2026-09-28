/**
 * @vitest-environment happy-dom
 */
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LinearTaskSyncProvider } from './LinearTaskSyncStatus';

const mocks = vi.hoisted(() => ({
  query: vi.fn().mockResolvedValue({ data: [] }),
  useClientDataSWR: vi.fn(),
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => 'workspace-1',
}));

vi.mock('@/libs/swr', () => ({
  useClientDataSWR: (...args: unknown[]) => mocks.useClientDataSWR(...args),
}));

vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: { linearSync: { issueLinks: { query: mocks.query } } },
}));

vi.mock('@/store/task', () => ({
  useTaskStore: (selector: (state: { tasks: never[]; taskGroups: never[] }) => unknown) =>
    selector({ tasks: [], taskGroups: [] }),
}));

vi.mock('@/store/task/selectors', () => ({
  taskListSelectors: {
    taskGroups: (state: { taskGroups: never[] }) => state.taskGroups,
    taskList: (state: { tasks: never[] }) => state.tasks,
  },
}));

describe('LinearTaskSyncProvider', () => {
  it('requests only explicit task ids and disables the request without ids', async () => {
    let fetcher: (() => Promise<unknown>) | undefined;
    mocks.useClientDataSWR.mockImplementation(
      (key: unknown, nextFetcher: () => Promise<unknown>) => {
        fetcher = key ? nextFetcher : undefined;
        return { data: [] };
      },
    );

    const view = render(
      <LinearTaskSyncProvider taskIds={['task-1', 'task-2']}>
        <span>list</span>
      </LinearTaskSyncProvider>,
    );
    await fetcher?.();
    expect(mocks.query).toHaveBeenCalledWith({ taskIds: ['task-1', 'task-2'] });

    view.rerender(
      <LinearTaskSyncProvider taskIds={[]}>
        <span>detail-loading</span>
      </LinearTaskSyncProvider>,
    );
    await waitFor(() =>
      expect(mocks.useClientDataSWR).toHaveBeenLastCalledWith(
        null,
        expect.any(Function),
        expect.any(Object),
      ),
    );
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
});
