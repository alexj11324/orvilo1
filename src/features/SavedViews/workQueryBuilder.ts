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

type BuilderNode = WorkQueryFilter | WorkQueryPredicate;

/**
 * Blueprint of the original `filter.all`, in source order: `row` slots point
 * at an editable row by id, `node` slots hold a non-renderable node verbatim.
 * Rebuilding walks the blueprint so untouched pieces keep their positions and
 * a deleted row removes exactly its slot.
 */
export type BuilderSlot = { node: BuilderNode; type: 'node' } | { rowId: string; type: 'row' };

export interface BuilderState {
  /**
   * The stored top-level `filter.any` group, kept verbatim. The builder only
   * edits flat `filter.all` predicates, so the OR subtree passes through
   * untouched — an edit (or a pure rename) never recompiles `any` into `all`.
   */
  any: BuilderNode[];
  rows: FilterRow[];
  slots: BuilderSlot[];
}

let rowSeq = 0;
const nextRowId = () => `filter-row-${++rowSeq}`;

const isPredicate = (node: BuilderNode): node is WorkQueryPredicate =>
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
 * Split a stored filter into builder rows plus the parts the builder cannot
 * express: non-renderable `all` nodes stay as `node` slots at their original
 * positions, and the whole `any` group is kept as a verbatim subtree.
 */
export const filterToBuilder = (
  entityType: WorkQueryEntityType,
  filter: WorkQueryFilter | undefined,
): BuilderState => {
  const rows: FilterRow[] = [];
  const slots: BuilderSlot[] = [];
  for (const node of filter?.all ?? []) {
    const spec = isPredicate(node) ? workQueryFieldSpec(entityType, node.field) : undefined;
    if (spec && isPredicate(node) && spec.ops.includes(node.op) && isRenderableValue(spec, node)) {
      const row: FilterRow = {
        field: node.field,
        id: nextRowId(),
        op: node.op,
        value: node.value,
      };
      rows.push(row);
      slots.push({ rowId: row.id, type: 'row' });
    } else {
      slots.push({ node, type: 'node' });
    }
  }
  return { any: [...(filter?.any ?? [])], rows, slots };
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
  const rowsById = new Map(state.rows.map((row) => [row.id, row]));
  const slottedRowIds = new Set<string>();
  const all: BuilderNode[] = [];
  for (const slot of state.slots) {
    if (slot.type === 'node') {
      all.push(slot.node);
      continue;
    }
    slottedRowIds.add(slot.rowId);
    const row = rowsById.get(slot.rowId);
    if (!row) continue;
    const predicate = rowToPredicate(entityType, row);
    if (predicate) all.push(predicate);
  }
  // Rows added after load have no slot — they append to `all` in row order.
  for (const row of state.rows) {
    if (slottedRowIds.has(row.id)) continue;
    const predicate = rowToPredicate(entityType, row);
    if (predicate) all.push(predicate);
  }
  const filter: WorkQueryFilter = {};
  if (all.length > 0) filter.all = all;
  if (state.any.length > 0) filter.any = [...state.any];
  return filter.all || filter.any ? filter : undefined;
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
