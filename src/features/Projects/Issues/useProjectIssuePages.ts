import type { WorkQuery } from '@orvilo/types';
import { useCallback, useRef, useState } from 'react';

import {
  mergeWorkQueryGroups,
  mergeWorkQueryPage,
  type WorkQueryGroupPage,
  workQueryHasMore,
  workQueryResponseGroups,
  workQueryResponseTasks,
  type WorkQueryResultTask,
} from '@/features/MyWork/workQueryPaging';
import { stableStringify } from '@/features/SavedViews/workQueryBuilder';
import { useClientDataSWR } from '@/libs/swr';
import { workAttentionService } from '@/services/workAttention';

import { PROJECT_ISSUE_PAGE_SIZE } from './projectIssueWorkQuery';

const asListItem = (
  task: WorkQueryResultTask,
): WorkQueryResultTask & { participants: NonNullable<WorkQueryResultTask['participants']> } => ({
  ...task,
  participants: task.participants ?? [],
});

/**
 * One page of a project-issue work query, plus a tail the caller appends.
 * The first page is cached; later pages reset when the query changes.
 */
export const useProjectIssuePages = (query: WorkQuery | null) => {
  const key = query ? stableStringify(query) : '';
  const swr = useClientDataSWR(query ? ['project-issue-query', key] : null, () =>
    workAttentionService.query({ limit: PROJECT_ISSUE_PAGE_SIZE, query: query! }),
  );
  const firstTasks = workQueryResponseTasks<WorkQueryResultTask>(swr.data?.data).map(asListItem);
  const firstGroups = workQueryResponseGroups<WorkQueryResultTask>(swr.data?.data);
  const queryHash =
    swr.data?.data && 'queryHash' in swr.data.data ? swr.data.data.queryHash : undefined;
  const total = swr.data?.data && 'total' in swr.data.data ? swr.data.data.total : undefined;
  const [taskTail, setTaskTail] = useState<ReturnType<typeof asListItem>[]>([]);
  const [groupTail, setGroupTail] = useState<WorkQueryGroupPage<WorkQueryResultTask>[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [seenKey, setSeenKey] = useState(key);
  const queryKeyRef = useRef(key);
  queryKeyRef.current = key;
  const queryChanged = seenKey !== key;
  if (queryChanged) {
    setSeenKey(key);
    setTaskTail([]);
    setGroupTail([]);
    setLoadingMore(false);
  }

  const tasks = mergeWorkQueryPage(firstTasks, queryChanged ? [] : taskTail);
  const groups = mergeWorkQueryGroups(firstGroups, queryChanged ? [] : groupTail);

  const loadMore = useCallback(async () => {
    const last = tasks.at(-1);
    const started = queryKeyRef.current;
    if (!query || !queryHash || !last || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await workAttentionService.query({
        afterId: last.id,
        limit: PROJECT_ISSUE_PAGE_SIZE,
        query,
        queryHash,
      });
      if (queryKeyRef.current !== started) return;
      setTaskTail((current) =>
        mergeWorkQueryPage(
          current,
          workQueryResponseTasks<WorkQueryResultTask>(next.data).map(asListItem),
        ),
      );
    } finally {
      if (queryKeyRef.current === started) setLoadingMore(false);
    }
  }, [loadingMore, query, queryHash, tasks]);

  const loadMoreGroup = useCallback(
    async (groupKey: string) => {
      const column = groups.find((group) => group.key === groupKey);
      const last = column?.tasks.at(-1);
      const started = queryKeyRef.current;
      if (!query || !queryHash || !last || loadingMore) return;
      setLoadingMore(true);
      try {
        const next = await workAttentionService.query({
          afterId: last.id,
          groupKey,
          limit: PROJECT_ISSUE_PAGE_SIZE,
          query,
          queryHash,
        });
        if (queryKeyRef.current !== started) return;
        setGroupTail((current) =>
          mergeWorkQueryGroups(current, workQueryResponseGroups<WorkQueryResultTask>(next.data)),
        );
      } finally {
        if (queryKeyRef.current === started) setLoadingMore(false);
      }
    },
    [groups, loadingMore, query, queryHash],
  );

  return {
    error: swr.error,
    groups,
    hasMore: workQueryHasMore(tasks.length, total),
    isLoading: swr.isLoading,
    loadMore,
    loadMoreGroup,
    loadingMore,
    refresh: swr.mutate,
    settled: swr.data !== undefined,
    tasks,
    total,
  };
};
