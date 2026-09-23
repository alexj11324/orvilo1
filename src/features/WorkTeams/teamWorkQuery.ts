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

/** Linear-style team issue scopes. `active` = unstarted + started work
 * (todo / in_progress / in_review); `backlog` keeps only backlog-category
 * items; `all` applies no workflow-category restriction — completed and
 * canceled stay readable while deleted rows are excluded by the model. */
export type TeamIssueScope = 'active' | 'all' | 'backlog';

const teamScopePredicate = (scope: TeamIssueScope): WorkQueryPredicate | undefined => {
  if (scope === 'backlog') {
    return { field: 'workflowCategory', op: 'eq', value: 'backlog' };
  }
  if (scope === 'active') {
    return {
      field: 'workflowCategory',
      op: 'in',
      value: ['todo', 'in_progress', 'in_review'],
    };
  }
  return undefined;
};

export const teamTaskQuery = (
  teamId: string,
  cycleId?: string | null,
  noProject = false,
  layout: WorkQueryLayout = 'list',
  scope: TeamIssueScope = 'all',
  triageCapable = false,
): WorkQuery => {
  const category = teamScopePredicate(scope);
  // Triaging teams park new issues in `untriaged` until the triage action
  // resolves them — they must not leak into All/Backlog scopes or the
  // `wf:backlog` board column while pending. Non-triage teams never produce
  // untriaged rows, so the predicate stays off there.
  const extra: WorkQueryPredicate[] = [
    ...(category ? [category] : []),
    ...(triageCapable
      ? [{ field: 'triageStatus' as const, op: 'neq' as const, value: 'untriaged' }]
      : []),
  ];
  const query = withTeamScope(teamId, extra, cycleId, noProject);
  if (layout !== 'board') {
    return { ...query, groupBy: 'status', layout: 'list' };
  }
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
