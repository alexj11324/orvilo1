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
 * The milestone fields the issues list needs: identity + label for grouping,
 * `sortOrder` so groups follow the project's milestone order, and `date` for
 * the row badge's `◆ name · date` chip (the form the reference's projects
 * list was measured with). `ProjectDetail['milestones']` rows already carry
 * all of these.
 */
export interface TaskMilestoneRef {
  date?: string | null;
  id: string;
  name: string;
  sortOrder?: number;
}

/**
 * Index a project's milestones by id for the issues list's group labels and
 * row badges. Returns `undefined` when no catalog was supplied — surfaces
 * without one (the global/agent scopes) offer no milestone dimension at all
 * rather than rendering raw ids.
 */
export const taskMilestoneById = (
  milestones?: readonly TaskMilestoneRef[],
): ReadonlyMap<string, TaskMilestoneRef> | undefined =>
  milestones ? new Map(milestones.map((milestone) => [milestone.id, milestone])) : undefined;

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
