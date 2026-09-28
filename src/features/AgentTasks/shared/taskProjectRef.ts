import type { TaskMilestoneRef } from '@/features/Projects/milestoneFilter';

/**
 * Pure resolution helpers that read a loaded project detail for the single
 * task the detail page is showing. Kept hook-free so the rail, the breadcrumb
 * and tests share one source of truth for "which project/milestone is this
 * issue filed under".
 */
export interface TaskProjectRow {
  id: string;
  projectMilestoneId?: string | null;
}

/**
 * The task detail payload only carries `projectId`, not the milestone link —
 * that lives on the project's task rows (`tasks.project_milestone_id`), so the
 * detail resolves it by matching its own database id against the project
 * detail's task list. Returns undefined when the task isn't in that list (the
 * detail fetch is still settling, or the task moved projects).
 */
export const taskMilestoneIdInProject = (
  tasks: readonly TaskProjectRow[] | undefined,
  taskDatabaseId: string | undefined,
): string | null | undefined => {
  if (!tasks || !taskDatabaseId) return undefined;
  const row = tasks.find((task) => task.id === taskDatabaseId);
  // `projectMilestoneId` present-but-null is a resolved "No milestone"; a
  // missing row is "unknown", which callers must not render as cleared.
  return row ? (row.projectMilestoneId ?? null) : undefined;
};

/** Look a milestone up inside the project's own catalog. */
export const milestoneById = (
  milestones: readonly TaskMilestoneRef[] | undefined,
  milestoneId: string | null | undefined,
): TaskMilestoneRef | undefined =>
  milestoneId ? milestones?.find((milestone) => milestone.id === milestoneId) : undefined;
