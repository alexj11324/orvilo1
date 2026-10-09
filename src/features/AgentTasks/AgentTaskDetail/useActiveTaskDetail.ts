import { useEffect } from 'react';

import { normalizeAsyncError } from '@/libs/swr/normalizeError';
import { useAgentStore } from '@/store/agent';
import { useTaskStore } from '@/store/task';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

import { isTaskDetailResolving } from './taskDetailReadiness';

export interface ActiveTaskDetailState {
  /** A transient fetch failure (network / 500) with no cached detail — distinct from a resolved not-found. Render a reload state, not a 404. */
  error?: unknown;
  /**
   * Loading gate: the first task snapshot isn't ready yet. The assignee agent's
   * config hydrates in the background and never holds the page.
   */
  isInitialLoading: boolean;
  /** The task fetch settled with a *resolved* not-found (deleted / never existed) and there is no cached detail. */
  isNotFound: boolean;
  /** Retry the task fetch — wired to the error state's Reload. */
  onRetry: () => void;
}

/**
 * Shared task-detail data wiring for every surface that shows a single task
 * (the full `/task/[tid]` page and the chat-side Portal). Owns `activeTaskId`
 * while mounted, drives the polling task fetch, and front-loads the assignee
 * agent's config into the agent store so model / heterogeneous-runtime reads
 * resolve against the *assignee* — not whatever agent happens to be active in
 * the surrounding chat. Returning only loading/not-found flags keeps each
 * surface free to own its own chrome.
 */
export const useActiveTaskDetail = (taskId?: string): ActiveTaskDetailState => {
  const isLogin = useUserStore(authSelectors.isLogin);
  const setActiveTaskId = useTaskStore((s) => s.setActiveTaskId);
  const useFetchTaskDetail = useTaskStore((s) => s.useFetchTaskDetail);
  const useHydrateAgentConfig = useAgentStore((s) => s.useHydrateAgentConfig);

  const hasTaskDetail = useTaskStore((s) => (taskId ? !!s.taskDetailMap[taskId] : false));
  // The assignee comes from the loaded task detail, so this stays undefined
  // until the first fetch resolves — which is exactly when its hydration kicks in.
  const assigneeAgentId = useTaskStore((s) =>
    taskId ? (s.taskDetailMap[taskId]?.agentId ?? undefined) : undefined,
  );

  useEffect(() => {
    if (!taskId) return;
    setActiveTaskId(taskId);
    // Only release the slot if it still points at this host's task — a second
    // detail host (route page + portal at narrow widths) may have claimed it
    // since; clearing unconditionally would blank the surviving host's global
    // consumers. Detail-subtree reads no longer depend on this slot (they bind
    // through TaskDetailScope), so the compare is transitional cleanup only.
    return () => {
      if (useTaskStore.getState().activeTaskId === taskId) setActiveTaskId(undefined);
    };
  }, [taskId, setActiveTaskId]);

  // `fetchTaskDetail` throws on a missing task, so `error` is the definitive
  // "settled and absent" signal — using it (instead of `!isLoading`) avoids the
  // first-paint flash where no fetch has run yet but the cache is still empty.
  const { error: taskError, mutate } = useFetchTaskDetail(taskId);

  // Hydrate-only (never touches `activeAgentId`); no-ops on an empty id, so it
  // simply activates once the assignee is known from the task detail.
  useHydrateAgentConfig(isLogin, assigneeAgentId ?? '');

  if (!taskId) return { isInitialLoading: false, isNotFound: false, onRetry: () => {} };

  // Split the single `error` signal: `fetchTaskDetail` tags a *resolved*
  // not-found with `code: 'TASK_NOT_FOUND'`, while a network / 500 rejection
  // carries an HTTP status instead. Only the former is a real 404 (a dead-end);
  // a transient failure must offer Reload, not tell the user the task was deleted.
  const settledWithoutDetail = !!taskError && !hasTaskDetail;
  const isResolvedNotFound = normalizeAsyncError(taskError).code === 'TASK_NOT_FOUND';
  const isNotFound = settledWithoutDetail && isResolvedNotFound;
  const fetchError = settledWithoutDetail && !isResolvedNotFound ? taskError : undefined;
  return {
    error: fetchError,
    // Anything that isn't "we have the detail", "confirmed gone", or "errored"
    // is still resolving — keep the skeleton up instead of flashing empty/404.
    // The assignee config hydrates in the background and does not gate the page.
    isInitialLoading: isTaskDetailResolving({ hasTaskDetail, settledWithoutDetail }),
    isNotFound,
    onRetry: () => mutate(),
  };
};
