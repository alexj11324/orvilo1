import type {
  WorkQuery,
  WorkQueryEntityType,
  WorkQueryFieldSpec,
  WorkQueryFilter,
  WorkQueryOp,
  WorkQueryPredicate,
  WorkQueryValue,
} from '@orvilo/types';
import { workQueryFieldSpec, workQueryFieldSpecs } from '@orvilo/types';

/**
 * One editable row of the visual filter builder. `id` is a React key only —
 * it never lands in the AST.
 */
export interface FilterRow {
  field: string;
  id: string;
  op: WorkQueryOp;
  /** Scalar for eq/neq, list for in/notIn; ignored for isNull/isNotNull. */
  value?: WorkQueryValue;
}

export interface BuilderState {
  /**
   * Nodes the builder cannot express (nested any-groups, unregistered fields,
   * unsupported ops). Kept verbatim on save — unknown conditions are never
   * silently dropped.
   */
  retained: (WorkQueryFilter | WorkQueryPredicate)[];
  rows: FilterRow[];
}

let rowSeq = 0;
const nextRowId = () => `filter-row-${++rowSeq}`;

const isPredicate = (node: WorkQueryFilter | WorkQueryPredicate): node is WorkQueryPredicate =>
  'field' in node && 'op' in node;

const isNullary = (op: WorkQueryOp) => op === 'isNull' || op === 'isNotNull';

/** Value from a predicate maps into a builder row when its shape fits the spec. */
const isRenderableValue = (spec: WorkQueryFieldSpec, predicate: WorkQueryPredicate): boolean => {
  if (isNullary(predicate.op)) return predicate.value === undefined;
  const value = predicate.value;
  if (predicate.op === 'in' || predicate.op === 'notIn') {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
  }
  if (spec.valueKind === 'user') {
    return (
      typeof value === 'string' ||
      (typeof value === 'object' &&
        value !== null &&
        'ref' in value &&
        (value as { ref: string }).ref === 'currentUser')
    );
  }
  return typeof value === 'string' || typeof value === 'number';
};

/**
 * Split a stored filter into builder rows + retained nodes. Only flat
 * `filter.all` predicates whose field/op/value are all registry-legal become
 * rows; everything else (any-groups, unknown fields, foreign ops) is retained.
 */
export const filterToBuilder = (
  entityType: WorkQueryEntityType,
  filter: WorkQueryFilter | undefined,
): BuilderState => {
  const rows: FilterRow[] = [];
  const retained: BuilderState['retained'] = [];
  for (const node of filter?.all ?? []) {
    if (!isPredicate(node)) {
      retained.push(node);
      continue;
    }
    const spec = workQueryFieldSpec(entityType, node.field);
    if (spec && spec.ops.includes(node.op) && isRenderableValue(spec, node)) {
      rows.push({ field: node.field, id: nextRowId(), op: node.op, value: node.value });
    } else {
      retained.push(node);
    }
  }
  for (const node of filter?.any ?? []) {
    retained.push(node);
  }
  return { retained, rows };
};

/** Row → predicate. Incomplete rows (missing value) are dropped on save. */
const rowToPredicate = (
  entityType: WorkQueryEntityType,
  row: FilterRow,
): WorkQueryPredicate | undefined => {
  const spec = workQueryFieldSpec(entityType, row.field);
  if (!spec || !spec.ops.includes(row.op)) return undefined;
  if (isNullary(row.op)) return { field: row.field as WorkQueryPredicate['field'], op: row.op };
  if (row.value === undefined) return undefined;
  if (row.op === 'in' || row.op === 'notIn') {
    return Array.isArray(row.value) && row.value.length > 0
      ? { field: row.field as WorkQueryPredicate['field'], op: row.op, value: row.value }
      : undefined;
  }
  return { field: row.field as WorkQueryPredicate['field'], op: row.op, value: row.value };
};

export const builderToFilter = (
  entityType: WorkQueryEntityType,
  state: BuilderState,
): WorkQueryFilter | undefined => {
  const predicates = state.rows
    .map((row) => rowToPredicate(entityType, row))
    .filter((node): node is WorkQueryPredicate => Boolean(node));
  const all = [...predicates, ...state.retained];
  return all.length > 0 ? { all } : undefined;
};

export const newFilterRow = (entityType: WorkQueryEntityType): FilterRow => {
  const specs = workQueryFieldSpecs(entityType);
  const firstSpec = specs[0];
  return { field: firstSpec?.field ?? 'status', id: nextRowId(), op: firstSpec?.ops[0] ?? 'eq' };
};

export const isRowComplete = (row: FilterRow): boolean => {
  if (isNullary(row.op)) return true;
  if (row.op === 'in' || row.op === 'notIn') {
    return Array.isArray(row.value) && row.value.length > 0;
  }
  return row.value !== undefined && row.value !== '';
};

/** Default operand for a spec — `currentUser` ref where the spec demands self. */
export const defaultRowValue = (spec: WorkQueryFieldSpec): WorkQueryValue | undefined =>
  spec.valueKind === 'user' ? { ref: 'currentUser' } : undefined;

/** Stable serialization for draft-vs-server comparison (key order normalized). */
export const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
};

/** Strip builder-only bits so two equivalent ASTs compare equal. */
export const comparableQuery = (query: WorkQuery): string => stableStringify(query);
