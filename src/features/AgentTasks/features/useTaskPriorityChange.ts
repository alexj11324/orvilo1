'use client';

import { useCallback, useRef, useState } from 'react';

import { useTaskStore } from '@/store/task';

interface UseTaskPriorityChangeOptions {
  canEdit: boolean;
  /** The priority currently committed on the task — a re-pick of it is a no-op. */
  currentPriority: number;
  /** Board/list surfaces own the write themselves; the hook only reports the pick. */
  onChange?: (priority: number) => void;
  taskIdentifier?: string;
}

/**
 * Writes a priority pick for the tag's own task. `runMutation` (inside
 * `updateTask`) already toasts on a failed write and rethrows, and
 * `updateTask` revalidates list+detail on a priority change — so the hook
 * only owns the pending flag: a `finally` releases it on every path (write
 * failure, refresh failure folded into `updateTask`, success, unmount-safe
 * since React drops the setState), and a `pending` re-pick is dropped
 * instead of double-submitting.
 */
export const useTaskPriorityChange = ({
  canEdit,
  currentPriority,
  onChange,
  taskIdentifier,
}: UseTaskPriorityChangeOptions) => {
  const [pending, setPending] = useState(false);
  const updateTask = useTaskStore((s) => s.updateTask);
  const pendingRef = useRef(false);

  const apply = useCallback(
    async (nextPriority: number) => {
      if (!canEdit) return;
      if (pendingRef.current) return;
      if (nextPriority === currentPriority) return;
      if (onChange) {
        onChange(nextPriority);
        return;
      }
      if (!taskIdentifier) return;
      pendingRef.current = true;
      setPending(true);
      try {
        await updateTask(taskIdentifier, { priority: nextPriority });
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [canEdit, currentPriority, onChange, taskIdentifier, updateTask],
  );

  return { apply, pending };
};
