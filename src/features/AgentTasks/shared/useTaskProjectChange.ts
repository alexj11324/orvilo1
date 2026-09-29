import { useCallback, useRef, useState } from 'react';

import { useProjectStore } from '@/store/project';
import { useTaskStore } from '@/store/task';

interface UseTaskProjectChangeOptions {
  /** Task identifier `updateTask` writes against. */
  taskId?: string | null;
}

/**
 * The project picker's write path. `updateTask` owns the optimistic detail
 * patch, the mutation and the detail/list refresh; this hook adds the two
 * project-facing reconciliations the move crosses — the previous project's
 * task catalog must drop the row, the new project's must gain it, and the
 * sidebar's project list re-resolves counts/order. A pick that arrives while
 * a write is still in flight is dropped rather than queued.
 */
export const useTaskProjectChange = ({ taskId }: UseTaskProjectChangeOptions) => {
  const updateTask = useTaskStore((s) => s.updateTask);
  const refreshProjectDetail = useProjectStore((s) => s.refreshProjectDetail);
  const refreshProjectList = useProjectStore((s) => s.refreshProjectList);
  const [pending, setPending] = useState(false);
  // A second pick can fire on the same tick the state update hasn't landed
  // yet, so the re-entry guard needs the ref, not the state it mirrors.
  const pendingRef = useRef(false);

  const apply = useCallback(
    async (nextProjectId: string | null, previousProjectId?: string | null) => {
      if (!taskId || pendingRef.current) return;
      pendingRef.current = true;
      setPending(true);
      try {
        await updateTask(taskId, { projectId: nextProjectId });
        // Only reconcile after the write commits — a failed mutation keeps
        // both project catalogs as they were (and runMutation already toasted).
        await Promise.allSettled([
          previousProjectId ? refreshProjectDetail(previousProjectId) : Promise.resolve(),
          nextProjectId ? refreshProjectDetail(nextProjectId) : Promise.resolve(),
          refreshProjectList(),
        ]);
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [taskId, updateTask, refreshProjectDetail, refreshProjectList],
  );

  return { apply, pending };
};
