'use client';

import { createContext, type ReactNode, use, useCallback } from 'react';

import { useTaskStore } from '@/store/task';
import type { TaskStoreState } from '@/store/task/initialState';

import { TaskDescriptionReferenceProvider } from './TaskDescriptionReferenceProvider';

const TaskDetailTaskIdContext = createContext<string | undefined>(undefined);

/**
 * Binds one mounted task-detail host's `taskId` to its subtree. Two hosts can
 * mount at once — the routed `/task/[tid]` page and the chat-side Portal
 * TaskDetail at narrow widths — and each must read its own task regardless of
 * which one most recently wrote the shared `activeTaskId` slot.
 */
export const TaskDetailScope = ({
  children,
  taskId,
}: {
  children?: ReactNode;
  taskId?: string;
}) => (
  <TaskDetailTaskIdContext value={taskId}>
    <TaskDescriptionReferenceProvider taskId={taskId}>{children}</TaskDescriptionReferenceProvider>
  </TaskDetailTaskIdContext>
);

/**
 * The taskId this detail subtree is bound to. Inside a `TaskDetailScope` it
 * is the host's own id; outside one it falls back to the global
 * `activeTaskId` so non-detail consumers keep their current behavior.
 */
export const useTaskDetailTaskId = (): string | undefined => {
  const scoped = use(TaskDetailTaskIdContext);
  const globalTaskId = useTaskStore((s) => s.activeTaskId);
  return scoped ?? globalTaskId;
};

/**
 * Read a `taskX(state, taskId)` detail selector bound to this host's task —
 * the subscription never follows `activeTaskId` while mounted, so a second
 * detail host mounting (or unmounting) cannot redirect this subtree's reads.
 */
export function useTaskDetailSelector<T>(
  selector: (state: TaskStoreState, taskId: string | undefined) => T,
): T {
  const taskId = useTaskDetailTaskId();
  return useTaskStore(useCallback((s) => selector(s, taskId), [selector, taskId]));
}
