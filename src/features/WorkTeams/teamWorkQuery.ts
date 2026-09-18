import {
  applyNoProjectFilter,
  type WorkQuery,
  type WorkQueryLayout,
  type WorkQueryPredicate,
} from '@orvilo/types';

export const ALL_TEAM_CYCLES = '__all__';

export const teamCyclePredicate = (
  cycleId: string | null | undefined,
): WorkQueryPredicate | undefined => {
  if (!cycleId || cycleId === ALL_TEAM_CYCLES) return undefined;
  return { field: 'cycleId', op: 'eq', value: cycleId };
};

const withTeamScope = (
  teamId: string,
  extra: WorkQueryPredicate[],
  cycleId?: string | null,
  noProject = false,
): WorkQuery => {
  const cycle = teamCyclePredicate(cycleId);
  return applyNoProjectFilter(
    {
      entityType: 'task',
      filter: {
        all: [{ field: 'teamId', op: 'eq', value: teamId }, ...extra, ...(cycle ? [cycle] : [])],
      },
      schemaVersion: 1,
    },
    noProject,
  );
};

export const teamTaskQuery = (
  teamId: string,
  cycleId?: string | null,
  noProject = false,
  layout: WorkQueryLayout = 'list',
): WorkQuery => {
  const query = withTeamScope(teamId, [], cycleId, noProject);
  if (layout !== 'board') return query;
  return { ...query, groupBy: 'workflowCategory', layout: 'board' };
};

export const teamTriageQuery = (
  teamId: string,
  cycleId?: string | null,
  noProject = false,
): WorkQuery =>
  withTeamScope(
    teamId,
    [{ field: 'triageStatus', op: 'eq', value: 'untriaged' }],
    cycleId,
    noProject,
  );
