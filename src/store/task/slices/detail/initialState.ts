import type { TaskDetailData } from '@orvilo/types';

import { type SaveStatus } from '@/types/saveState';

export interface TaskDetailSliceState {
  activeTaskId?: string;
  /**
   * Topic-scoped fallbacks for a drawer opened outside a task detail — the home
   * inbox opens runs that may have no parent task at all, so there is no
   * `taskDetailMap` entry to read the agent / title from.
   */
  activeTopicDrawerAgentId?: string;
  /**
   * The task (identifier) that owns the drawer's topic — set when a run is
   * opened from a surface where `activeTaskId` does not point at the owning
   * task (the kanban board), so run status / steering resolve against the
   * right task detail.
   */
  activeTopicDrawerTaskId?: string;
  activeTopicDrawerTitle?: string;
  activeTopicDrawerTopicId?: string;
  isCreatingTask: boolean;
  isDeletingTask: boolean;
  taskDetailMap: Record<string, TaskDetailData>;
  /**
   * Increments only when an authoritative source outside the mounted task editor
   * changes its persisted instruction snapshot. The editor uses this as an
   * explicit reload signal instead of comparing against live, unsaved content.
   */
  taskInstructionRevisionMap: Record<string, number>;
  // Save status is scoped per task id (mirrors `taskDetailMap`). A store-wide
  // field would leak one task's `failed` state across navigation, since
  // `setActiveTaskId` only swaps `activeTaskId` and never clears the status.
  taskSaveStatusMap: Record<string, SaveStatus>;
}

export const initialTaskDetailSliceState: TaskDetailSliceState = {
  isCreatingTask: false,
  isDeletingTask: false,
  taskDetailMap: {},
  taskInstructionRevisionMap: {},
  taskSaveStatusMap: {},
};
