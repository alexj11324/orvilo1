import {
  applyNoProjectFilter,
  type WorkQuery,
  type WorkQueryFilter,
  type WorkQueryGroupBy,
  type WorkQueryLayout,
  type WorkQueryPredicate,
  type WorkQuerySort,
  type WorkQuerySortMode,
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

export interface TeamTaskQueryOptions {
  /**
   * User-authored predicates from the Add-filter builder — nested verbatim
   * under `filter.all` (the same shape `teamViewDraftQuery` emits), so an
   * `any` subtree survives instead of being flattened away.
   */
  filter?: WorkQueryFilter;
  /** Resolved grouping — overrides the layout default when set. */
  groupBy?: WorkQueryGroupBy;
  /** Result ordering — absent keeps the server's default. */
  sort?: WorkQuerySort[];
  /** Board ordering semantics when a field sort is applied. */
  sortMode?: WorkQuerySortMode;
}

export const teamTaskQuery = (
  teamId: string,
  cycleId?: string | null,
  noProject = false,
  layout: WorkQueryLayout = 'list',
  scope: TeamIssueScope = 'all',
  triageCapable = false,
  options?: TeamTaskQueryOptions,
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
  const filtered = options?.filter
    ? {
        ...query,
        filter: { ...query.filter, all: [...(query.filter?.all ?? []), options.filter] },
      }
    : query;
  if (layout !== 'board') {
    return {
      ...filtered,
      groupBy: options?.groupBy ?? 'status',
      layout: 'list',
      sort: options?.sort,
    };
  }
  return {
    ...filtered,
    groupBy: options?.groupBy ?? 'workflowCategory',
    layout: 'board',
    sort: options?.sort,
    sortMode: options?.sortMode,
  };
};

/**
 * The triage queue: team-scoped `untriaged` rows. `options.filter` nests the
 * Add-filter builder output under `filter.all` verbatim (an `any` subtree
 * survives like it does on the issues surface); `options.sort` carries the
 * Display-options ordering — absent keeps the server's queue order.
 */
export const teamTriageQuery = (
  teamId: string,
  cycleId?: string | null,
  noProject = false,
  options?: Pick<TeamTaskQueryOptions, 'filter' | 'sort'>,
): WorkQuery => {
  const query = withTeamScope(
    teamId,
    [{ field: 'triageStatus', op: 'eq', value: 'untriaged' }],
    cycleId,
    noProject,
  );
  const filtered = options?.filter
    ? {
        ...query,
        filter: { ...query.filter, all: [...(query.filter?.all ?? []), options.filter] },
      }
    : query;
  return options?.sort ? { ...filtered, sort: options.sort } : filtered;
};
