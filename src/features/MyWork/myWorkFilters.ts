import type {
  MyWorkMode,
  WorkQuery,
  WorkQueryField,
  WorkQueryFilter,
  WorkQueryLayout,
  WorkQueryOp,
  WorkQueryValue,
} from '@orvilo/types';
import { applyDelegatedFilter, applyNoProjectFilter } from '@orvilo/types';

import type { BuilderState, FilterRow } from '@/features/SavedViews/workQueryBuilder';
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
  'createdByUserId',
  'priority',
  'labelId',
  'projectId',
  'workflowCategory',
  'triageStatus',
  'reviewerUserId',
  'cycleId',
];

const DIRECTORY_OPS: readonly WorkQueryOp[] = ['eq', 'in', 'isNull', 'isNotNull'];

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

/**
 * Multi-select directory toggle for string enums (status/workflowCategory/
 * triageStatus): picks collect in a single `in` predicate; empty removes it.
 */
export const toggleMyWorkDirectoryEnum = (
  builder: BuilderState,
  field: WorkQueryField,
  value: string,
): BuilderState => {
  const selected = new Set(
    myWorkDirectorySelectedValues(builder, field).filter(
      (item): item is string => typeof item === 'string',
    ),
  );
  if (selected.has(value)) selected.delete(value);
  else selected.add(value);
  const rows = builder.rows.filter((row) => !isDirectoryRow(row, field));
  if (selected.size === 0) return { ...builder, rows };
  return {
    ...builder,
    rows: [...rows, { field, id: nextDirectoryRowId(), op: 'in', value: [...selected] }],
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
