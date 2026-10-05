import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { projectIssueWorkQuery } from './projectIssueWorkQuery';
import { useProjectIssuePages } from './useProjectIssuePages';

const swr = {
  data: undefined as
    | {
        data: {
          queryHash: string;
          tasks: { id: string; identifier: string }[];
          total: number;
        };
      }
    | undefined,
  error: undefined,
  isLoading: false,
  mutate: vi.fn(),
};

vi.mock('@/libs/swr', () => ({
  useClientDataSWR: () => swr,
}));

const query = vi.fn();

vi.mock('@/services/workAttention', () => ({
  workAttentionService: {
    query: (...args: unknown[]) => query(...args),
  },
}));

const listQuery = (projectId: string) =>
  projectIssueWorkQuery({
    filters: [{ type: 'priority', values: [1] }],
    layout: 'list',
    projectId,
  });

describe('useProjectIssuePages', () => {
  beforeEach(() => {
    query.mockReset();
    swr.data = {
      data: {
        queryHash: 'h1',
        tasks: [{ id: 'a', identifier: 'A' }],
        total: 3,
      },
    };
  });

  it('drops the previous tail on the render that switches queries', async () => {
    const { rerender, result } = renderHook(
      ({ projectId }: { projectId: string }) => useProjectIssuePages(listQuery(projectId)),
      { initialProps: { projectId: 'p1' } },
    );
    expect(result.current.tasks.map((task) => task.id)).toEqual(['a']);

    query.mockResolvedValue({
      data: { queryHash: 'h1', tasks: [{ id: 'b', identifier: 'B' }], total: 3 },
    });
    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.tasks.map((task) => task.id)).toEqual(['a', 'b']);

    swr.data = {
      data: {
        queryHash: 'h2',
        tasks: [{ id: 'c', identifier: 'C' }],
        total: 1,
      },
    };
    rerender({ projectId: 'p2' });
    expect(result.current.tasks.map((task) => task.id)).toEqual(['c']);
  });

  it('drops a load-more that resolves after the query changes', async () => {
    let resolveNext: (value: unknown) => void = () => {};
    query.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveNext = resolve;
        }),
    );
    const { rerender, result } = renderHook(
      ({ projectId }: { projectId: string }) => useProjectIssuePages(listQuery(projectId)),
      { initialProps: { projectId: 'p1' } },
    );
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.loadMore();
    });
    swr.data = {
      data: {
        queryHash: 'h2',
        tasks: [{ id: 'c', identifier: 'C' }],
        total: 1,
      },
    };
    rerender({ projectId: 'p2' });
    expect(result.current.tasks.map((task) => task.id)).toEqual(['c']);
    await act(async () => {
      resolveNext({
        data: { queryHash: 'h1', tasks: [{ id: 'b', identifier: 'B' }], total: 3 },
      });
      await pending;
    });
    expect(result.current.tasks.map((task) => task.id)).toEqual(['c']);
  });
});
