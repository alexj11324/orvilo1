import type {
  MyWorkMode,
  WorkQuery,
  WorkQueryField,
  WorkQueryFilter,
  WorkQueryGroupBy,
  WorkQueryLayout,
  WorkQueryOp,
  WorkQuerySubGroupBy,
  WorkQueryValue,
} from '@orvilo/types';
import {
  applyDelegatedFilter,
  applyNoProjectFilter,
  normalizeWorkQuerySubGroupBy,
} from '@orvilo/types';

import type { BuilderState, FilterRow } from '@/features/SavedViews/workQueryBuilder';
import { builderToFilter } from '@/features/SavedViews/workQueryBuilder';

import {
  completedWindowQueryFilter,
  MY_WORK_ORDERING_SORTS,
  type MyWorkCompletedWindow,
  type MyWorkOrdering,
} from './myWorkDisplay';
import { isMyWorkSaveableMode, myWorkSaveAsQuery } from './myWorkSaveAs';

/** Builder start state — no editable rows, no preserved nodes. */
export const EMPTY_FILTER_BUILDER: BuilderState = { any: [], rows: [], slots: [] };

export const workQueryFilterHasPredicates = (filter: WorkQueryFilter | undefined): boolean =>
  Boolean(filter && ((filter.all?.length ?? 0) > 0 || (filter.any?.length ?? 0) > 0));

/** `?filter=` carries the builder AST. Malformed params read as no filter. */
export const parseWorkQueryFilterParam = (raw: string | null): WorkQueryFilter | undefined => {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const filter = parsed as WorkQueryFilter;
    return filter.all || filter.any ? filter : undefined;
  } catch {
    return undefined;
  }
};

export const serializeWorkQueryFilterParam = (
  filter: WorkQueryFilter | undefined,
): string | null => (workQueryFilterHasPredicates(filter) ? JSON.stringify(filter) : null);

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
  /** Completed-issues window, merged into the mode predicate. */
  completed?: MyWorkCompletedWindow;
  delegated: boolean;
  /** Extra predicates from the visual builder (mode predicate stays implicit). */
  filter?: WorkQueryFilter;
  /** Resolved list/board grouping, including activity date, project and cycle. */
  groupBy: WorkQueryGroupBy;
  layout: WorkQueryLayout;
  mode: MyWorkMode;
  noProject: boolean;
  ordering: MyWorkOrdering;
  /** Board swimlane or list sub-group. */
  subGroupBy?: WorkQuerySubGroupBy;
  /** IANA zone for activity-date groups. */
  timeZone?: string;
}

/**
 * Compose the generic work-query endpoint payload for a non-default ordering.
 * Subscribed and activity carry their EXISTS predicate in the AST. Activity
 * lists still pass `mode: 'activity'` so the page sorts by notification time.
 * Delegated and review stay on the `myWork` endpoint.
 */
export const myWorkComposedQuery = ({
  completed = 'all',
  delegated,
  filter,
  groupBy,
  layout,
  mode,
  noProject,
  ordering,
  subGroupBy,
  timeZone,
}: MyWorkComposedQueryInput): WorkQuery | null => {
  if (!isMyWorkSaveableMode(mode)) return null;
  const base = myWorkSaveAsQuery(mode, layout);
  const boardGroupBy =
    layout === 'board'
      ? groupBy === 'status' ||
        groupBy === 'priority' ||
        groupBy === 'assignee' ||
        groupBy === 'attention'
        ? groupBy
        : 'workflowCategory'
      : groupBy;
  const lane = normalizeWorkQuerySubGroupBy(boardGroupBy, subGroupBy);
  const query: WorkQuery = {
    ...base,
    filter: mergeWorkQueryFilters(
      mergeWorkQueryFilters(base.filter, filter),
      completedWindowQueryFilter(completed),
    ),
    groupBy: boardGroupBy,
    layout,
    ...(lane ? { subGroupBy: lane } : {}),
    ...(ordering === 'default' ? {} : { sort: MY_WORK_ORDERING_SORTS[ordering] }),
    ...(timeZone ? { timeZone } : {}),
  };
  return applyNoProjectFilter(applyDelegatedFilter(query, delegated), noProject);
};

/* --------------- filter directory (Linear's "Add filter" menu) --------------- */

/**
 * First-level field list for the "Add filter" popover, ordered after Linear's
 * directory (Team → Status → Assignee → Creator → Priority → Labels →
 * Project → …). Only fields the builder spec (`WORK_QUERY_TASK_FIELD_SPECS`)
 * covers AND the picker can resolve real values for appear here — `cycleId`
 * exposes its nullary options only (a cycle picker would need a team
 * selector first), and project-entity fields never applied to tasks.
 */
export const MY_WORK_FILTER_DIRECTORY_FIELDS: readonly WorkQueryField[] = [
  'teamId',
  'status',
  'assigneeUserId',
  'assigneeAgentId',
  'createdByUserId',
  'priority',
  'labelId',
  'projectId',
  'workflowCategory',
  'triageStatus',
  'reviewerUserId',
  'cycleId',
  'createdAt',
  'updatedAt',
  'completedAt',
  'text',
];

const DIRECTORY_OPS: readonly WorkQueryOp[] = [
  'between',
  'contains',
  'eq',
  'gte',
  'in',
  'isNull',
  'isNotNull',
  'lt',
];

/** Rows the directory can author for `field` — flat eq/in/nullary predicates. */
const isDirectoryRow = (row: FilterRow, field: WorkQueryField): boolean =>
  row.field === field && (DIRECTORY_OPS as readonly string[]).includes(row.op);

export const myWorkDirectoryRowsFor = (builder: BuilderState, field: WorkQueryField): FilterRow[] =>
  builder.rows.filter((row) => isDirectoryRow(row, field));

/** Whether the field carries ANY predicate, including builder-authored ops. */
export const myWorkDirectoryFieldActive = (builder: BuilderState, field: WorkQueryField): boolean =>
  builder.rows.some((row) => row.field === field);

const workQueryValuesEqual = (
  left: WorkQueryValue | undefined,
  right: WorkQueryValue | undefined,
): boolean => {
  if (left === right) return true;
  if (typeof left === 'object' && typeof right === 'object' && left !== null && right !== null) {
    return 'ref' in left && 'ref' in right && left.ref === right.ref;
  }
  return false;
};

/** Scalar values a field's directory rows currently select (eq operands + in list). */
export const myWorkDirectorySelectedValues = (
  builder: BuilderState,
  field: WorkQueryField,
): WorkQueryValue[] =>
  myWorkDirectoryRowsFor(builder, field).flatMap((row) => {
    if (row.op === 'in') return Array.isArray(row.value) ? row.value : [];
    if (row.op === 'eq') return row.value === undefined ? [] : [row.value];
    return [];
  });

export const myWorkDirectoryNullaryActive = (
  builder: BuilderState,
  field: WorkQueryField,
  op: 'isNotNull' | 'isNull',
): boolean => myWorkDirectoryRowsFor(builder, field).some((row) => row.op === op);

let directoryRowSeq = 0;
const nextDirectoryRowId = () => `my-work-filter-${++directoryRowSeq}`;

/**
 * Single-select directory toggle (user/team/project/priority): one `eq`
 * predicate per field — picking the selected value removes it, picking
 * another replaces it. Every directory write replaces the field's directory
 * rows wholesale, so value and nullary picks stay mutually exclusive.
 * Builder-authored rows on other ops (neq/notIn) are left alone.
 */
export const toggleMyWorkDirectoryValue = (
  builder: BuilderState,
  field: WorkQueryField,
  value: WorkQueryValue,
): BuilderState => {
  const selected = myWorkDirectorySelectedValues(builder, field);
  const active = selected.length === 1 && workQueryValuesEqual(selected[0], value);
  const rows = builder.rows.filter((row) => !isDirectoryRow(row, field));
  if (active) return { ...builder, rows };
  return { ...builder, rows: [...rows, { field, id: nextDirectoryRowId(), op: 'eq', value }] };
};

const isDirectoryInMember = (
  value: WorkQueryValue,
): value is number | string | { ref: 'currentUser' } =>
  typeof value === 'number' ||
  typeof value === 'string' ||
  (typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'ref' in value &&
    value.ref === 'currentUser');

const directoryValueKey = (value: WorkQueryValue): string => {
  if (typeof value === 'object' && value !== null && 'ref' in value) return `ref:${value.ref}`;
  return `${typeof value}:${String(value)}`;
};

/**
 * Multi-select directory toggle. Picks on one field collect in a single `in`
 * predicate — string enums, numeric priority, people, projects and teams.
 * Empty removes the row. A `{ref:'currentUser'}` member stays inside the list.
 */
export const toggleMyWorkDirectoryMulti = (
  builder: BuilderState,
  field: WorkQueryField,
  value: number | string | { ref: 'currentUser' },
): BuilderState => {
  const selected = myWorkDirectorySelectedValues(builder, field).filter(isDirectoryInMember);
  const key = directoryValueKey(value);
  const next = selected.some((item) => directoryValueKey(item) === key)
    ? selected.filter((item) => directoryValueKey(item) !== key)
    : [...selected, value];
  const rows = builder.rows.filter((row) => !isDirectoryRow(row, field));
  if (next.length === 0) return { ...builder, rows };
  return {
    ...builder,
    rows: [...rows, { field, id: nextDirectoryRowId(), op: 'in', value: next }],
  };
};

/**
 * Multi-select directory toggle for string enums (status/workflowCategory/
 * triageStatus): picks collect in a single `in` predicate; empty removes it.
 */
export const toggleMyWorkDirectoryEnum = (
  builder: BuilderState,
  field: WorkQueryField,
  value: string,
): BuilderState => toggleMyWorkDirectoryMulti(builder, field, value);

export type MyWorkDateWindow = 'past' | 'past30' | 'set' | 'unset';

/** Date directory: set/unset/past/past30 map onto isNotNull/isNull/lt/between. */
export const setMyWorkDirectoryDateWindow = (
  builder: BuilderState,
  field: WorkQueryField,
  window: MyWorkDateWindow,
  now: Date = new Date(),
): BuilderState => {
  const current = myWorkDirectoryRowsFor(builder, field)[0];
  const same =
    (window === 'set' && current?.op === 'isNotNull') ||
    (window === 'unset' && current?.op === 'isNull') ||
    (window === 'past' && current?.op === 'lt') ||
    (window === 'past30' && current?.op === 'between');
  const rows = builder.rows.filter((row) => !isDirectoryRow(row, field));
  if (same) return { ...builder, rows };
  if (window === 'set') {
    return { ...builder, rows: [...rows, { field, id: nextDirectoryRowId(), op: 'isNotNull' }] };
  }
  if (window === 'unset') {
    return { ...builder, rows: [...rows, { field, id: nextDirectoryRowId(), op: 'isNull' }] };
  }
  if (window === 'past') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    return {
      ...builder,
      rows: [...rows, { field, id: nextDirectoryRowId(), op: 'lt', value: start }],
    };
  }
  return {
    ...builder,
    rows: [
      ...rows,
      {
        field,
        id: nextDirectoryRowId(),
        op: 'between',
        value: {
          from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          to: now.toISOString(),
        },
      },
    ],
  };
};

export const setMyWorkDirectoryText = (
  builder: BuilderState,
  field: WorkQueryField,
  query: string,
): BuilderState => {
  const rows = builder.rows.filter((row) => !isDirectoryRow(row, field));
  const trimmed = query.trim();
  if (!trimmed) return { ...builder, rows };
  return {
    ...builder,
    rows: [...rows, { field, id: nextDirectoryRowId(), op: 'contains', value: trimmed }],
  };
};

/** Nullary toggle — `isNull`/`isNotNull` replace the field's other directory rows. */
export const toggleMyWorkDirectoryNullary = (
  builder: BuilderState,
  field: WorkQueryField,
  op: 'isNotNull' | 'isNull',
): BuilderState => {
  const active = myWorkDirectoryNullaryActive(builder, field, op);
  const rows = builder.rows.filter((row) => !isDirectoryRow(row, field));
  if (active) return { ...builder, rows };
  return { ...builder, rows: [...rows, { field, id: nextDirectoryRowId(), op }] };
};

/** Drop every directory row for a field (field-picker "clear"). */
export const clearMyWorkDirectoryField = (
  builder: BuilderState,
  field: WorkQueryField,
): BuilderState => ({
  ...builder,
  rows: builder.rows.filter((row) => !isDirectoryRow(row, field)),
});
