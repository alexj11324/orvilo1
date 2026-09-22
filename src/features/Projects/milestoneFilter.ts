import { getProjectTasksPath } from './Layout/navigation';

/**
 * Query parameter that narrows a project's issues to one milestone. Named after
 * the reference, whose overview links each milestone to
 * `…/issues?projectMilestoneId=<id>` — keeping the name means a URL carried
 * between the two reads the same.
 */
export const PROJECT_MILESTONE_FILTER_PARAM = 'projectMilestoneId';

export const getProjectMilestoneIssuesPath = (projectRef: string, milestoneId: string) =>
  `${getProjectTasksPath(projectRef)}?${PROJECT_MILESTONE_FILTER_PARAM}=${encodeURIComponent(milestoneId)}`;

export const readProjectMilestoneFilter = (searchParams: URLSearchParams): string | undefined =>
  searchParams.get(PROJECT_MILESTONE_FILTER_PARAM) || undefined;

/**
 * Narrow a project's issues to one milestone, client-side.
 *
 * This is exact only because the project issues list fetches the whole list
 * (`complete: true`) — the same reason it can group client-side. The board
 * pages its columns on the server, so a client-side cut there would show
 * per-column counts that describe the unfiltered set; the page therefore
 * forces the list surface while this filter is active.
 */
export const filterTasksByMilestone = <T extends { projectMilestoneId?: string | null }>(
  tasks: readonly T[],
  milestoneId: string,
): T[] => tasks.filter((task) => task.projectMilestoneId === milestoneId);
