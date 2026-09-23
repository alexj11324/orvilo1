import type { MyWorkMode, WorkQuery, WorkQueryFilter, WorkQueryLayout } from '@orvilo/types';
import { applyDelegatedFilter, applyNoProjectFilter } from '@orvilo/types';

import type { BuilderState } from '@/features/SavedViews/workQueryBuilder';
import { builderToFilter } from '@/features/SavedViews/workQueryBuilder';

import { MY_WORK_ORDERING_SORTS, type MyWorkOrdering } from './myWorkDisplay';
import { isMyWorkSaveableMode, myWorkSaveAsQuery } from './myWorkSaveAs';

/** Builder start state — no editable rows, no preserved nodes. */
export const EMPTY_FILTER_BUILDER: BuilderState = { any: [], rows: [], slots: [] };

export const workQueryFilterHasPredicates = (filter: WorkQueryFilter | undefined): boolean =>
  Boolean(filter && ((filter.all?.length ?? 0) > 0 || (filter.any?.length ?? 0) > 0));

/**
 * AND-merge two filters, preserving `all`/`any` grouping. The mode predicate
 * always comes from `base`; `extra` is the builder's user-authored layer.
 */
export const mergeWorkQueryFilters = (
  base: WorkQueryFilter | undefined,
  extra: WorkQueryFilter | undefined,
): WorkQueryFilter | undefined => {
  const all = [...(base?.all ?? []), ...(extra?.all ?? [])];
  const any = [...(base?.any ?? []), ...(extra?.any ?? [])];
  if (all.length === 0 && any.length === 0) return undefined;
  return {
    ...(all.length > 0 ? { all } : {}),
    ...(any.length > 0 ? { any } : {}),
  };
};

/** Applied extra predicates — drives the Filter icon's active state and chip. */
export const myWorkActiveFilterCount = (builder: BuilderState): number => {
  const filter = builderToFilter('task', builder);
  return (filter?.all?.length ?? 0) + (filter?.any?.length ?? 0);
};

export interface MyWorkComposedQueryInput {
  delegated: boolean;
  /** Extra predicates from the visual builder (mode predicate stays implicit). */
  filter?: WorkQueryFilter;
  /** Resolved list/board grouping — `activityDate` never reaches this layer. */
  groupBy: 'attention' | 'none' | 'status' | 'workflowCategory';
  layout: WorkQueryLayout;
  mode: MyWorkMode;
  noProject: boolean;
  ordering: MyWorkOrdering;
}

/**
 * Compose the generic work-query endpoint payload for the Filter/Ordering
 * path. Only `assigned`/`created` are expressible: `subscribed` and
 * `activity` scope their rows through mode-injected SQL EXISTS clauses that
 * `workAttentionService.query` does not receive (`mode` is not a parameter),
 * so those tabs return `null` and keep the plain `myWork` call.
 */
export const myWorkComposedQuery = ({
  delegated,
  filter,
  groupBy,
  layout,
  mode,
  noProject,
  ordering,
}: MyWorkComposedQueryInput): WorkQuery | null => {
  if (!isMyWorkSaveableMode(mode)) return null;
  const base = myWorkSaveAsQuery(mode, layout);
  const query: WorkQuery = {
    ...base,
    filter: mergeWorkQueryFilters(base.filter, filter),
    groupBy: layout === 'board' ? (groupBy === 'status' ? 'status' : 'workflowCategory') : groupBy,
    layout,
    ...(ordering === 'default' ? {} : { sort: MY_WORK_ORDERING_SORTS[ordering] }),
  };
  return applyNoProjectFilter(applyDelegatedFilter(query, delegated), noProject);
};
