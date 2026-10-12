import type { TaskActivityLogPayload, TaskActivityLogType } from '@orvilo/types';
import { inArray } from 'drizzle-orm';

import { ProjectModel } from '@/database/models/project';
import { TeamModel } from '@/database/models/team';
import { projectMilestones } from '@/database/schemas/project';
import { teamWorkflowStates } from '@/database/schemas/team';
import type { OrviloDatabase } from '@/database/type';

interface ActivityLogRow {
  payload: TaskActivityLogPayload | null;
  type: TaskActivityLogType;
}

/**
 * The activity kinds whose `fromId` / `toId` name a container — a project,
 * a milestone, a team, or a team's workflow state — and whose payload also
 * carries that container's name, copied in when the row was written.
 */
const CONTAINER_TYPES = ['milestone', 'project', 'team', 'workflow_state'] as const;
type ContainerType = (typeof CONTAINER_TYPES)[number];

const isContainerType = (type: TaskActivityLogType): type is ContainerType =>
  (CONTAINER_TYPES as readonly string[]).includes(type);

/** Container ids this reader may be shown the name of, per activity kind. */
export type ReadableActivityContainers = Record<ContainerType, ReadonlySet<string>>;

const NOTHING_READABLE: ReadableActivityContainers = {
  milestone: new Set(),
  project: new Set(),
  team: new Set(),
  workflow_state: new Set(),
};

/**
 * Which of the containers named by `rows` this reader may read, in a fixed
 * handful of queries however many rows there are.
 *
 * An Issue is readable across its workspace, but a private team — and so its
 * workflow states — and a project are not: reading an Issue must not also
 * disclose the name of a container the reader could not open. A milestone
 * follows its project and a workflow state follows its team.
 *
 * Anything that cannot be confirmed readable is left out, including a
 * container that has since been deleted and any id at all when the lookup
 * fails: the row then says "a project that is no longer available" (or shows
 * the state's category) rather than a name nobody checked.
 */
export const resolveReadableActivityContainers = async (
  db: OrviloDatabase,
  scope: { userId: string; workspaceId?: string | null },
  rows: ActivityLogRow[],
): Promise<ReadableActivityContainers> => {
  const ids: Record<ContainerType, Set<string>> = {
    milestone: new Set(),
    project: new Set(),
    team: new Set(),
    workflow_state: new Set(),
  };
  for (const row of rows) {
    if (!isContainerType(row.type)) continue;
    for (const id of [row.payload?.fromId, row.payload?.toId]) if (id) ids[row.type].add(id);
  }
  if (CONTAINER_TYPES.every((type) => ids[type].size === 0)) return NOTHING_READABLE;

  try {
    const [milestones, states] = await Promise.all([
      ids.milestone.size > 0
        ? db
            .select({ id: projectMilestones.id, projectId: projectMilestones.projectId })
            .from(projectMilestones)
            .where(inArray(projectMilestones.id, [...ids.milestone]))
        : [],
      ids.workflow_state.size > 0
        ? db
            .select({ id: teamWorkflowStates.id, teamId: teamWorkflowStates.teamId })
            .from(teamWorkflowStates)
            .where(inArray(teamWorkflowStates.id, [...ids.workflow_state]))
        : [],
    ]);

    const projectIds = [...new Set([...ids.project, ...milestones.map((row) => row.projectId)])];
    const teamIds = [...new Set([...ids.team, ...states.map((row) => row.teamId)])];
    const workspaceId = scope.workspaceId ?? undefined;
    const [projects, readableTeamIds] = await Promise.all([
      new ProjectModel(db, scope.userId, workspaceId).findByIds(projectIds),
      // Teams only exist inside a workspace.
      workspaceId && teamIds.length > 0
        ? new TeamModel(db, scope.userId, workspaceId).filterReadableTeamIds(teamIds)
        : [],
    ]);
    const project = new Set(projects.map((row) => row.id));
    const team = new Set(readableTeamIds);

    return {
      milestone: new Set(
        milestones.filter((row) => project.has(row.projectId)).map((row) => row.id),
      ),
      project,
      team,
      workflow_state: new Set(states.filter((row) => team.has(row.teamId)).map((row) => row.id)),
    };
  } catch (error) {
    console.error('[activityContainerAccess] could not resolve readable containers:', error);
    return NOTHING_READABLE;
  }
};

/**
 * `row` with the name of every container this reader may not read removed.
 * The id stays, so the feed still says something was there: an unnamed
 * project / milestone / team reads as "no longer available", an unnamed
 * workflow state as its category. Pure; returns `row` itself when nothing
 * had to go.
 */
export const withReadableContainerNames = <T extends ActivityLogRow>(
  row: T,
  readable: ReadableActivityContainers,
): T => {
  if (!isContainerType(row.type) || !row.payload) return row;
  const allowed = readable[row.type];
  const { fromId, fromLabel, toId, toLabel } = row.payload;
  const hideFrom = fromLabel != null && !(fromId && allowed.has(fromId));
  const hideTo = toLabel != null && !(toId && allowed.has(toId));
  if (!hideFrom && !hideTo) return row;
  return {
    ...row,
    payload: {
      ...row.payload,
      ...(hideFrom && { fromLabel: null }),
      ...(hideTo && { toLabel: null }),
    },
  };
};
