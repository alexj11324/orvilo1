'use client';

import type { TaskMilestoneRef } from '@/features/Projects/milestoneFilter';
import type { ProjectDetail } from '@/store/project';
import { useCurrentProjectDetail, useProjectStore } from '@/store/project';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import { milestoneById, taskMilestoneIdInProject } from './taskProjectRef';

export interface ActiveTaskProject {
  /** The milestone the task is filed under; undefined when it has none or the project rows haven't landed. */
  milestone?: TaskMilestoneRef;
  /** The project's full milestone catalog — feeds the picker, in project order. */
  milestones: TaskMilestoneRef[];
  /** The loaded project row once `project.detail` resolves; undefined while loading or when the task has no project. */
  project?: ProjectDetail['project'];
  /** `/project/<ref>` link target — Linear links by slug, id is the fallback. */
  projectRef?: string;
  /** The task's database id — the key `setTaskMilestone` expects. */
  taskDatabaseId?: string;
}

/**
 * Resolve the project the active task is filed under, plus the milestone the
 * project's own task list says it carries. `TaskDetailData` only exposes
 * `projectId`; everything else (name/avatar for the chip, milestone link,
 * milestone catalog for the picker) comes from the shared
 * `useFetchProjectDetail` cache the project pages already populate — so the
 * rail and the breadcrumb read one fetch, never two.
 */
export const useActiveTaskProject = (): ActiveTaskProject => {
  const projectId = useTaskStore((s) => taskDetailSelectors.activeTaskDetail(s)?.projectId);
  const taskDatabaseId = useTaskStore(taskDetailSelectors.activeTaskDatabaseId);

  // Drive the fetch through the store hook; read the resolved payload from
  // the hydrated `projectDetails` cache — the same object
  // `setTaskMilestone`'s write-through revalidation refreshes.
  useProjectStore((s) => s.useFetchProjectDetail)(projectId ?? undefined);
  const detail = useCurrentProjectDetail(projectId ?? undefined);

  const project = detail?.project;
  const milestones = detail?.milestones ?? [];
  const milestoneId = taskMilestoneIdInProject(detail?.tasks, taskDatabaseId);

  return {
    milestone: milestoneById(milestones, milestoneId),
    milestones,
    project,
    projectRef: project ? project.slug || project.id : undefined,
    taskDatabaseId,
  };
};
