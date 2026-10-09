import type {
  MyWorkMode,
  TaskAttentionReason,
  TaskDispatchPhase,
  TaskLabelSummary,
  TaskStatus,
  WorkQuery,
  WorkQueryCountResult,
  WorkQueryEntityType,
  WorkQueryExternalReview,
  WorkQueryFacetBucket,
  WorkQueryFacetField,
  WorkQueryFacetResult,
  WorkQueryField,
  WorkQueryFilter,
  WorkQueryGroupBy,
  WorkQueryLayout,
  WorkQueryOp,
  WorkQueryPredicate,
  WorkQuerySort,
} from '@orvilo/types';
import {
  isWorkAttentionAllowedHttpsHost,
  normalizeWorkQuery,
  normalizeWorkQuerySubGroupBy,
  PROJECT_STATUS_VALUES,
  WORK_QUERY_BOARD_KEY_SEP,
  WORK_QUERY_FACET_FIELDS,
  WORK_QUERY_MAX_DEPTH,
  WORK_QUERY_MAX_IN_VALUES,
  WORK_QUERY_MAX_PREDICATES,
  WORK_QUERY_PRIORITY_KEYS,
  WORK_QUERY_STATUS_COLUMNS,
  WORK_QUERY_WORKFLOW_COLUMNS,
  WORK_SEARCH_MAX_PER_TYPE,
} from '@orvilo/types';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  type SQL,
  sql,
  type SQLWrapper,
} from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';

import { actionApprovals } from '../schemas/actionApproval';
import { executionGrants } from '../schemas/executionGrant';
import { notifications } from '../schemas/notification';
import { projects } from '../schemas/project';
import { taskDependencies, taskDispatches, tasks, taskTopics } from '../schemas/task';
import { taskLabelBindings } from '../schemas/taskLabel';
import { projectTeams, teamCycles, teams } from '../schemas/team';
import { taskSubscriptions } from '../schemas/workAttention';
import type { OrviloDatabase } from '../type';
import { buildProjectReadableWhere } from '../utils/projectReadable';
import { buildTaskReadableWhere, taskVisibilitySql } from '../utils/taskTeamReadable';
import { ProjectModel } from './project';
import { taskEffectivePosition } from './task';
import {
  hasLiveTaskExecutor,
  latestDispatchPhase,
  legacyStatusExpr,
  predicateForLegacyStatus,
  predicateForLegacyStatuses,
  TASK_OPEN_WORKFLOW,
  taskAttentionReasonExpr,
} from './taskExecutionSql';
import { TaskLabelModel, toTaskLabelSummary } from './taskLabel';
import { TeamModel } from './team';

export class WorkQueryError extends Error {
  constructor(
    readonly code: 'CURSOR_INVALID' | 'INVALID_QUERY' | 'QUERY_TOO_COMPLEX',
    message: string,
  ) {
    super(message);
    this.name = 'WorkQueryError';
  }
}

const TASK_FIELDS = new Set<WorkQueryField>([
  'assigneeAgentId',
  'assigneeUserId',
  'closedAt',
  'completedAt',
  'createdAt',
  'createdByUserId',
  'cycleId',
  'delegatedByUserId',
  'executionState',
  'hasActivity',
  'id',
  'labelId',
  'parentTaskId',
  'priority',
  'projectId',
  'projectMilestoneId',
  'reviewerUserId',
  'status',
  'subscribed',
  'teamId',
  'text',
  'triageStatus',
  'updatedAt',
  'workflowCategory',
]);

const PROJECT_FIELDS = new Set<WorkQueryField>([
  'id',
  'ownerUserId',
  'status',
  'teamId',
  'visibility',
]);

const isPredicate = (node: WorkQueryFilter | WorkQueryPredicate): node is WorkQueryPredicate =>
  'field' in node && 'op' in node;

const FALSE_SQL = sql`false`;
const TRUE_SQL = sql`true`;

const escapeLike = (value: string) => value.replaceAll(/[\\%_]/g, (char) => `\\${char}`);

export const filterHasTeamId = (node: WorkQueryFilter | undefined): boolean => {
  if (!node) return false;
  for (const child of [...(node.all ?? []), ...(node.any ?? [])]) {
    if (isPredicate(child)) {
      if (child.field === 'teamId') return true;
      continue;
    }
    if (filterHasTeamId(child)) return true;
  }
  return false;
};

type CompileCtx = {
  currentUserId: string;
  entityType: WorkQueryEntityType;
  readableTeamIds: ReadonlySet<string>;
};

const isCurrentUserRef = (value: unknown): value is { ref: 'currentUser' } =>
  Boolean(value && typeof value === 'object' && 'ref' in value && value.ref === 'currentUser');

const isDateRange = (value: unknown): value is { from: string; to: string } =>
  Boolean(
    value &&
    typeof value === 'object' &&
    'from' in value &&
    'to' in value &&
    typeof value.from === 'string' &&
    typeof value.to === 'string',
  );

/** Resolve `{ref:'currentUser'}` members so `in` can mix "me" with ids. */
const assertInValues = (
  resolved: unknown,
  op: 'in' | 'notIn',
  currentUserId: string,
): Array<number | string> => {
  if (!Array.isArray(resolved) || resolved.length === 0) {
    throw new WorkQueryError('INVALID_QUERY', `${op} requires a non-empty array`);
  }
  if (resolved.length > WORK_QUERY_MAX_IN_VALUES) {
    throw new WorkQueryError('QUERY_TOO_COMPLEX', `${op} exceeded maximum values`);
  }
  return resolved.map((item) => {
    if (isCurrentUserRef(item)) return currentUserId;
    if (typeof item === 'string' || typeof item === 'number') return item;
    throw new WorkQueryError('INVALID_QUERY', `${op} values must be strings or numbers`);
  });
};

const compileTeamIdColumnPredicate = (
  column: AnyPgColumn,
  op: WorkQueryOp,
  resolved: ReturnType<typeof resolveValue>,
  readableTeamIds: ReadonlySet<string>,
  currentUserId: string,
): SQL => {
  const readable = [...readableTeamIds];
  switch (op) {
    case 'isNull': {
      return isNull(column);
    }
    case 'isNotNull': {
      return readable.length ? inArray(column, readable) : FALSE_SQL;
    }
    case 'eq': {
      if (typeof resolved !== 'string' || !readableTeamIds.has(resolved)) return FALSE_SQL;
      return eq(column, resolved as never);
    }
    case 'in': {
      const kept = assertInValues(resolved, 'in', currentUserId).filter(
        (item): item is string => typeof item === 'string' && readableTeamIds.has(item),
      );
      return kept.length ? inArray(column, kept) : FALSE_SQL;
    }
    case 'neq': {
      if (typeof resolved !== 'string' || !readableTeamIds.has(resolved)) return TRUE_SQL;
      return ne(column, resolved as never);
    }
    case 'notIn': {
      const kept = assertInValues(resolved, 'notIn', currentUserId).filter(
        (item): item is string => typeof item === 'string' && readableTeamIds.has(item),
      );
      return kept.length ? notInArray(column, kept) : TRUE_SQL;
    }
    default: {
      throw new WorkQueryError('INVALID_QUERY', `Unknown operator: ${String(op)}`);
    }
  }
};

const countPredicates = (node: WorkQueryFilter | undefined, depth: number): number => {
  if (!node) return 0;
  if (depth > WORK_QUERY_MAX_DEPTH) {
    throw new WorkQueryError('QUERY_TOO_COMPLEX', 'Query exceeded maximum depth');
  }
  const children = [...(node.all ?? []), ...(node.any ?? [])];
  let total = 0;
  for (const child of children) {
    total += isPredicate(child) ? 1 : countPredicates(child, depth + 1);
  }
  return total;
};

const resolveValue = (value: WorkQueryPredicate['value'], currentUserId: string) => {
  if (value && typeof value === 'object' && 'ref' in value) {
    if (value.ref !== 'currentUser') {
      throw new WorkQueryError('INVALID_QUERY', 'Unsupported value ref');
    }
    return currentUserId;
  }
  return value;
};

const taskColumn = (field: WorkQueryField) => {
  switch (field) {
    case 'assigneeAgentId': {
      return tasks.assigneeAgentId;
    }
    case 'assigneeUserId': {
      return tasks.assigneeUserId;
    }
    case 'completedAt': {
      return tasks.completedAt;
    }
    case 'createdAt': {
      return tasks.createdAt;
    }
    case 'createdByUserId': {
      return tasks.createdByUserId;
    }
    case 'cycleId': {
      return tasks.cycleRefId;
    }
    case 'id': {
      return tasks.id;
    }
    case 'parentTaskId': {
      return tasks.parentTaskId;
    }
    case 'priority': {
      return tasks.priority;
    }
    case 'projectId': {
      return tasks.projectId;
    }
    case 'projectMilestoneId': {
      return tasks.projectMilestoneId;
    }
    case 'reviewerUserId': {
      return tasks.reviewerUserId;
    }
    case 'status': {
      return legacyStatusExpr;
    }
    case 'teamId': {
      return tasks.teamId;
    }
    case 'triageStatus': {
      return tasks.triageStatus;
    }
    case 'updatedAt': {
      return tasks.updatedAt;
    }
    case 'workflowCategory': {
      return tasks.workflowCategory;
    }
    default: {
      throw new WorkQueryError('INVALID_QUERY', `Unknown field: ${field}`);
    }
  }
};

const compileColumnPredicate = (
  column: SQLWrapper,
  op: WorkQueryOp,
  resolved: ReturnType<typeof resolveValue>,
  currentUserId: string,
): SQL => {
  switch (op) {
    case 'isNull': {
      return isNull(column);
    }
    case 'isNotNull': {
      return isNotNull(column);
    }
    case 'eq': {
      if (resolved === null || resolved === undefined || Array.isArray(resolved)) {
        throw new WorkQueryError('INVALID_QUERY', 'eq requires a scalar value');
      }
      return eq(column, resolved as never);
    }
    case 'neq': {
      if (resolved === null || resolved === undefined || Array.isArray(resolved)) {
        throw new WorkQueryError('INVALID_QUERY', 'neq requires a scalar value');
      }
      return ne(column, resolved as never);
    }
    case 'in': {
      return inArray(column, assertInValues(resolved, 'in', currentUserId) as never[]);
    }
    case 'notIn': {
      return notInArray(column, assertInValues(resolved, 'notIn', currentUserId) as never[]);
    }
    default: {
      throw new WorkQueryError('INVALID_QUERY', `Unknown operator: ${String(op)}`);
    }
  }
};

const compilePredicate = (predicate: WorkQueryPredicate, ctx: CompileCtx): SQL => {
  const allowed = ctx.entityType === 'task' ? TASK_FIELDS : PROJECT_FIELDS;
  if (!allowed.has(predicate.field)) {
    throw new WorkQueryError('INVALID_QUERY', `Unknown field: ${predicate.field}`);
  }

  if (ctx.entityType === 'project') {
    if (predicate.field === 'id') {
      return compileColumnPredicate(
        projects.id,
        predicate.op,
        resolveValue(predicate.value, ctx.currentUserId),
        ctx.currentUserId,
      );
    }
    if (predicate.field === 'status') {
      return compileColumnPredicate(
        projects.status,
        predicate.op,
        resolveValue(predicate.value, ctx.currentUserId),
        ctx.currentUserId,
      );
    }
    if (predicate.field === 'visibility') {
      return compileColumnPredicate(
        projects.visibility,
        predicate.op,
        resolveValue(predicate.value, ctx.currentUserId),
        ctx.currentUserId,
      );
    }
    if (predicate.field === 'ownerUserId') {
      return compileColumnPredicate(
        projects.userId,
        predicate.op,
        resolveValue(predicate.value, ctx.currentUserId),
        ctx.currentUserId,
      );
    }
    if (predicate.field === 'teamId') {
      const resolved = resolveValue(predicate.value, ctx.currentUserId);
      if (predicate.op === 'isNull') {
        return sql`not exists (select 1 from ${projectTeams} where ${projectTeams.projectId} = ${projects.id})`;
      }
      if (predicate.op === 'isNotNull') {
        const readable = [...ctx.readableTeamIds];
        if (readable.length === 0) return FALSE_SQL;
        return sql`exists (select 1 from ${projectTeams} where ${projectTeams.projectId} = ${projects.id} and ${inArray(projectTeams.teamId, readable)})`;
      }
      if (predicate.op !== 'eq' || typeof resolved !== 'string') {
        throw new WorkQueryError('INVALID_QUERY', 'project teamId only supports eq / null checks');
      }
      if (!ctx.readableTeamIds.has(resolved)) return FALSE_SQL;
      return sql`exists (select 1 from ${projectTeams} where ${projectTeams.projectId} = ${projects.id} and ${projectTeams.teamId} = ${resolved})`;
    }
    throw new WorkQueryError('INVALID_QUERY', `Unknown field: ${predicate.field}`);
  }

  if (predicate.field === 'delegatedByUserId') {
    const resolved = resolveValue(predicate.value, ctx.currentUserId);
    if (predicate.op !== 'eq' || typeof resolved !== 'string') {
      throw new WorkQueryError('INVALID_QUERY', 'delegatedByUserId only supports eq currentUser');
    }
    return sql`exists (select 1 from ${executionGrants} where ${executionGrants.taskId} = ${tasks.id} and ${executionGrants.initiatedBy} = ${resolved} and ${executionGrants.status} = 'active')`;
  }

  if (predicate.field === 'reviewerUserId') {
    // `isNotNull` = "task is in review" — has a reviewer or a pending
    // task-targeted approval, whoever they are for.
    if (predicate.op === 'isNotNull') {
      return or(
        isNotNull(tasks.reviewerUserId),
        sql`exists (select 1 from ${actionApprovals} where ${actionApprovals.targetId} = ${tasks.id} and ${actionApprovals.targetType} = 'task' and ${actionApprovals.status} = 'pending')`,
      )!;
    }
    const resolved = resolveValue(predicate.value, ctx.currentUserId);
    if (predicate.op !== 'eq' || typeof resolved !== 'string') {
      throw new WorkQueryError('INVALID_QUERY', 'reviewerUserId only supports eq currentUser');
    }
    return or(
      eq(tasks.reviewerUserId, resolved),
      sql`exists (select 1 from ${actionApprovals} where ${actionApprovals.targetId} = ${tasks.id} and ${actionApprovals.status} = 'pending' and ${actionApprovals.approverUserId} = ${resolved})`,
    )!;
  }

  if (predicate.field === 'teamId') {
    return compileTeamIdColumnPredicate(
      tasks.teamId,
      predicate.op,
      resolveValue(predicate.value, ctx.currentUserId),
      ctx.readableTeamIds,
      ctx.currentUserId,
    );
  }

  if (predicate.field === 'executionState') {
    return compileExecutionStatePredicate(
      predicate.op,
      resolveValue(predicate.value, ctx.currentUserId),
      ctx.currentUserId,
    );
  }

  if (predicate.field === 'labelId') {
    // Labels are many-to-many: match through an EXISTS on the join table so a
    // multi-labeled task is returned once, never duplicated per binding. The
    // join table alone is sufficient — binding rows are scope-stamped at write
    // and a foreign-scope label id simply matches nothing.
    const resolved = resolveValue(predicate.value, ctx.currentUserId);
    const anyBinding = sql`exists (select 1 from ${taskLabelBindings} where ${taskLabelBindings.taskId} = ${tasks.id})`;
    const bindingWith = (match: SQL) =>
      sql`exists (select 1 from ${taskLabelBindings} where ${taskLabelBindings.taskId} = ${tasks.id} and ${match})`;
    switch (predicate.op) {
      case 'isNull': {
        return sql`not ${anyBinding}`;
      }
      case 'isNotNull': {
        return anyBinding;
      }
      case 'eq': {
        if (typeof resolved !== 'string') {
          throw new WorkQueryError('INVALID_QUERY', 'labelId eq requires a label id');
        }
        return bindingWith(sql`${taskLabelBindings.labelId} = ${resolved}`);
      }
      case 'neq': {
        if (typeof resolved !== 'string') {
          throw new WorkQueryError('INVALID_QUERY', 'labelId neq requires a label id');
        }
        return sql`not ${bindingWith(sql`${taskLabelBindings.labelId} = ${resolved}`)}`;
      }
      case 'in': {
        const values = assertInValues(resolved, 'in', ctx.currentUserId).filter(
          (item): item is string => typeof item === 'string',
        );
        return values.length ? bindingWith(inArray(taskLabelBindings.labelId, values)) : FALSE_SQL;
      }
      case 'notIn': {
        const values = assertInValues(resolved, 'notIn', ctx.currentUserId).filter(
          (item): item is string => typeof item === 'string',
        );
        return values.length
          ? sql`not ${bindingWith(inArray(taskLabelBindings.labelId, values))}`
          : TRUE_SQL;
      }
      default: {
        throw new WorkQueryError('INVALID_QUERY', `Unknown operator: ${String(predicate.op)}`);
      }
    }
  }

  const op: WorkQueryOp = predicate.op;
  const resolved = resolveValue(predicate.value, ctx.currentUserId);

  if (predicate.field === 'text') {
    if (op !== 'contains' || typeof resolved !== 'string' || !resolved.trim()) {
      throw new WorkQueryError('INVALID_QUERY', 'text only supports contains');
    }
    const pattern = `%${escapeLike(resolved.trim())}%`;
    return or(
      sql`${tasks.name} ilike ${pattern} escape '\\'`,
      sql`${tasks.description} ilike ${pattern} escape '\\'`,
      sql`${tasks.instruction} ilike ${pattern} escape '\\'`,
    )!;
  }

  if (predicate.field === 'subscribed' || predicate.field === 'hasActivity') {
    if (op !== 'eq' || resolved !== ctx.currentUserId) {
      throw new WorkQueryError('INVALID_QUERY', `${predicate.field} only supports eq currentUser`);
    }
    return predicate.field === 'subscribed'
      ? sql`exists (select 1 from ${taskSubscriptions} where ${taskSubscriptions.taskId} = ${tasks.id} and ${taskSubscriptions.userId} = ${ctx.currentUserId} and ${taskSubscriptions.unsubscribedAt} is null)`
      : sql`exists (select 1 from ${notifications} where ${notifications.userId} = ${ctx.currentUserId} and ${notifications.resourceType} = 'task' and ${notifications.resourceId} = ${tasks.id})`;
  }

  if (
    predicate.field === 'createdAt' ||
    predicate.field === 'updatedAt' ||
    predicate.field === 'completedAt' ||
    predicate.field === 'closedAt'
  ) {
    const column =
      predicate.field === 'closedAt'
        ? sql`coalesce(${tasks.completedAt}, ${tasks.updatedAt})`
        : taskColumn(predicate.field);
    return compileDatePredicate(column, op, resolved);
  }

  if (predicate.field === 'status') {
    return compileLegacyStatusPredicate(predicate.op, resolved, ctx.currentUserId);
  }

  return compileColumnPredicate(taskColumn(predicate.field), op, resolved, ctx.currentUserId);
};

/**
 * The deprecated `status` filter field — translated to canonical workflow /
 * execution predicates so saved views keep working while `tasks.status` is
 * never read. `isNull` never matches (every task has canonical truth).
 */
const compileLegacyStatusPredicate = (
  op: WorkQueryOp,
  resolved: ReturnType<typeof resolveValue>,
  currentUserId: string,
): SQL => {
  const match = (statuses: readonly (number | string)[]) => {
    const predicate = predicateForLegacyStatuses(statuses.map((status) => String(status)));
    return predicate ?? FALSE_SQL;
  };
  switch (op) {
    case 'isNull': {
      return FALSE_SQL;
    }
    case 'isNotNull': {
      return TRUE_SQL;
    }
    case 'eq': {
      if (typeof resolved !== 'string' && typeof resolved !== 'number') {
        throw new WorkQueryError('INVALID_QUERY', 'eq requires a scalar value');
      }
      return predicateForLegacyStatus(String(resolved)) ?? FALSE_SQL;
    }
    case 'neq': {
      if (typeof resolved !== 'string' && typeof resolved !== 'number') {
        throw new WorkQueryError('INVALID_QUERY', 'neq requires a scalar value');
      }
      const predicate = predicateForLegacyStatus(String(resolved));
      return predicate ? sql`not (${predicate})` : TRUE_SQL;
    }
    case 'in': {
      return match(assertInValues(resolved, 'in', currentUserId));
    }
    case 'notIn': {
      const predicate = match(assertInValues(resolved, 'notIn', currentUserId));
      return sql`not (${predicate})`;
    }
    default: {
      throw new WorkQueryError('INVALID_QUERY', `Unknown operator: ${String(op)}`);
    }
  }
};

const compileDatePredicate = (
  column: AnyPgColumn | SQL,
  op: WorkQueryOp,
  resolved: ReturnType<typeof resolveValue>,
): SQL => {
  const instant = (value: unknown, label: string) => {
    if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) {
      throw new WorkQueryError('INVALID_QUERY', `${label} requires an ISO timestamp`);
    }
    return new Date(value);
  };
  // `closedAt` is `coalesce(...)`, a SQL fragment. Drizzle's comparison
  // helpers only accept a column or a SQL value, not the union, so the
  // predicate is written as SQL for both.
  switch (op) {
    case 'isNull': {
      return sql`${column} is null`;
    }
    case 'isNotNull': {
      return sql`${column} is not null`;
    }
    case 'lt': {
      return sql`${column} < ${instant(resolved, 'lt')}`;
    }
    case 'gte': {
      return sql`${column} >= ${instant(resolved, 'gte')}`;
    }
    case 'between': {
      if (!isDateRange(resolved)) {
        throw new WorkQueryError('INVALID_QUERY', 'between requires {from, to}');
      }
      const from = instant(resolved.from, 'between.from');
      const to = instant(resolved.to, 'between.to');
      return sql`${column} >= ${from} and ${column} <= ${to}`;
    }
    default: {
      throw new WorkQueryError('INVALID_QUERY', `Unknown operator: ${String(op)}`);
    }
  }
};

const compileFilter = (
  node: WorkQueryFilter | undefined,
  ctx: CompileCtx,
  depth = 0,
): SQL | undefined => {
  if (!node) return undefined;
  if (depth > WORK_QUERY_MAX_DEPTH) {
    throw new WorkQueryError('QUERY_TOO_COMPLEX', 'Query exceeded maximum depth');
  }
  const parts: SQL[] = [];
  if (node.all?.length) {
    const compiled = node.all.map((child) =>
      isPredicate(child) ? compilePredicate(child, ctx) : compileFilter(child, ctx, depth + 1),
    );
    const present = compiled.filter((item): item is SQL => Boolean(item));
    if (present.length) parts.push(and(...present)!);
  }
  if (node.any?.length) {
    const compiled = node.any.map((child) =>
      isPredicate(child) ? compilePredicate(child, ctx) : compileFilter(child, ctx, depth + 1),
    );
    const present = compiled.filter((item): item is SQL => Boolean(item));
    if (present.length) parts.push(or(...present)!);
  }
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : and(...parts)!;
};

export const validateWorkQuery = (query: WorkQuery) => {
  if (query.schemaVersion !== 1 && query.schemaVersion !== 2) {
    throw new WorkQueryError('INVALID_QUERY', 'Unsupported schemaVersion');
  }
  if (query.entityType !== 'task' && query.entityType !== 'project') {
    throw new WorkQueryError('INVALID_QUERY', 'Unsupported entityType');
  }
  const total = countPredicates(query.filter, 0);
  if (total > WORK_QUERY_MAX_PREDICATES) {
    throw new WorkQueryError('QUERY_TOO_COMPLEX', 'Query exceeded maximum predicates');
  }
  if (query.sortMode !== undefined && query.sortMode !== 'field' && query.sortMode !== 'manual') {
    throw new WorkQueryError('INVALID_QUERY', `Unknown sortMode: ${String(query.sortMode)}`);
  }
  if (
    query.subGroupBy &&
    query.subGroupBy !== 'none' &&
    query.layout === 'board' &&
    !normalizeWorkQuerySubGroupBy(query.groupBy, query.subGroupBy)
  ) {
    throw new WorkQueryError('INVALID_QUERY', 'Board axes cannot repeat the same state machine');
  }
};

export const myWorkQueryForMode = (mode: MyWorkMode): WorkQuery => {
  const current = { ref: 'currentUser' as const };
  switch (mode) {
    case 'assigned': {
      return {
        entityType: 'task',
        filter: { all: [{ field: 'assigneeUserId', op: 'eq', value: current }] },
        schemaVersion: 2,
        sort: [
          { direction: 'desc', field: 'updatedAt' },
          { direction: 'asc', field: 'id' },
        ],
      };
    }
    case 'created': {
      return {
        entityType: 'task',
        filter: { all: [{ field: 'createdByUserId', op: 'eq', value: current }] },
        schemaVersion: 2,
        sort: [
          { direction: 'desc', field: 'createdAt' },
          { direction: 'asc', field: 'id' },
        ],
      };
    }
    case 'delegated': {
      return {
        entityType: 'task',
        filter: { all: [{ field: 'delegatedByUserId', op: 'eq', value: current }] },
        schemaVersion: 2,
      };
    }
    case 'review': {
      return {
        entityType: 'task',
        filter: { all: [{ field: 'reviewerUserId', op: 'eq', value: current }] },
        schemaVersion: 2,
      };
    }
    case 'subscribed': {
      return {
        entityType: 'task',
        filter: { all: [{ field: 'subscribed', op: 'eq', value: current }] },
        schemaVersion: 2,
      };
    }
    case 'activity': {
      // "Activity" = tasks with real activity for the caller — notification
      // episodes carry actor/verb/subject. The predicate is the same EXISTS
      // taskConditions adds when `mode` is passed; the list path still orders
      // by the episode's `lastActivityAt` when that mode is set.
      return {
        entityType: 'task',
        filter: { all: [{ field: 'hasActivity', op: 'eq', value: current }] },
        schemaVersion: 2,
        sort: [
          { direction: 'desc', field: 'updatedAt' },
          { direction: 'asc', field: 'id' },
        ],
      };
    }
  }
};

export const hashQuery = (query: WorkQuery) => JSON.stringify(query);

/**
 * SQL projection of the canonical execution state — mirrors
 * `deriveTaskExecutionState` (packages/types): the latest dispatch's phase and
 * the latest run's `run_state` are each mapped onto the execution enum, the
 * furthest-advanced rank wins (tie → dispatch, the contract fence), and
 * Never reads `tasks.status` (retired): tasks with no execution rows project
 * NULL — `isNull` on `executionState` is "never ran".
 */
const taskExecutionStateExpr = sql`
  (select case
    when d.exec_state is not null and r.exec_state is not null then
      case when d.exec_rank >= r.exec_rank then d.exec_state else r.exec_state end
    else coalesce(d.exec_state, r.exec_state)
  end
  from (values (1)) as seed(x)
  left join lateral (
    select
      case ${taskDispatches.phase}
        when 'requested' then 'queued'
        when 'claimed' then 'queued'
        when 'provisioning' then 'provisioning'
        when 'dispatched' then 'running'
        when 'running' then 'running'
        when 'cancel_requested' then 'running'
        when 'waiting' then 'waiting'
        when 'succeeded' then 'succeeded'
        when 'failed' then 'failed'
        when 'canceled' then 'canceled'
        when 'abandoned' then 'outcome_unknown'
        when 'outcome_unknown' then 'outcome_unknown'
      end as exec_state,
      case ${taskDispatches.phase}
        when 'requested' then 0
        when 'claimed' then 0
        when 'provisioning' then 1
        when 'dispatched' then 2
        when 'running' then 2
        when 'cancel_requested' then 2
        when 'waiting' then 3
        else 4
      end as exec_rank
    from ${taskDispatches}
    where ${taskDispatches.taskId} = ${tasks.id}
    order by ${taskDispatches.generation} desc
    limit 1
  ) as d on true
  left join lateral (
    select
      case ${taskTopics.runState}
        when 'queued' then 'queued'
        when 'provisioning' then 'provisioning'
        when 'running' then 'running'
        when 'cancel_requested' then 'running'
        when 'waiting' then 'waiting'
        when 'succeeded' then 'succeeded'
        when 'failed' then 'failed'
        when 'canceled' then 'canceled'
        when 'outcome_unknown' then 'outcome_unknown'
      end as exec_state,
      case ${taskTopics.runState}
        when 'queued' then 0
        when 'provisioning' then 1
        when 'running' then 2
        when 'cancel_requested' then 2
        when 'waiting' then 3
        else 4
      end as exec_rank
    from ${taskTopics}
    where ${taskTopics.taskId} = ${tasks.id}
    order by ${taskTopics.createdAt} desc
    limit 1
  ) as r on true)`;

/** `executionState` is a projected expression, not a column — same enum ops. */
const compileExecutionStatePredicate = (
  op: WorkQueryOp,
  resolved: ReturnType<typeof resolveValue>,
  currentUserId: string,
): SQL => {
  switch (op) {
    case 'isNull': {
      return sql`${taskExecutionStateExpr} is null`;
    }
    case 'isNotNull': {
      return sql`${taskExecutionStateExpr} is not null`;
    }
    case 'eq': {
      if (typeof resolved !== 'string' && typeof resolved !== 'number') {
        throw new WorkQueryError('INVALID_QUERY', 'eq requires a scalar value');
      }
      return sql`${taskExecutionStateExpr} = ${resolved}`;
    }
    case 'neq': {
      if (typeof resolved !== 'string' && typeof resolved !== 'number') {
        throw new WorkQueryError('INVALID_QUERY', 'neq requires a scalar value');
      }
      return sql`${taskExecutionStateExpr} is distinct from ${resolved}`;
    }
    case 'in': {
      return inArray(taskExecutionStateExpr, assertInValues(resolved, 'in', currentUserId));
    }
    case 'notIn': {
      // NULL-safe complement: never-ran tasks (NULL projection) are "not in".
      return or(
        sql`${taskExecutionStateExpr} is null`,
        notInArray(taskExecutionStateExpr, assertInValues(resolved, 'notIn', currentUserId)),
      )!;
    }
    default: {
      throw new WorkQueryError('INVALID_QUERY', `Unknown operator: ${String(op)}`);
    }
  }
};

/** One extra row tells a full page from the last page. The extra row is not returned. */
const limitPage = <T>(rows: T[], limit: number): { hasMore: boolean; rows: T[] } => {
  if (rows.length <= limit) return { hasMore: false, rows };
  return { hasMore: true, rows: rows.slice(0, limit) };
};

const BOARD_GROUP_BY = new Set<WorkQueryGroupBy>([
  'agent',
  'assignee',
  'attention',
  'priority',
  'status',
  'workflowCategory',
]);

const LIST_GROUP_BY = new Set<WorkQueryGroupBy>([
  'activityDate',
  'agent',
  'assignee',
  'attention',
  'cycle',
  'milestone',
  'priority',
  'project',
  'status',
  'workflowCategory',
]);

export const applyWorkQueryLayout = (
  query: WorkQuery,
  layout?: WorkQueryLayout,
  groupBy?: WorkQueryGroupBy,
): WorkQuery => {
  const nextLayout = layout ?? query.layout ?? 'list';
  // Projects only have a status axis. A board with no grouping still draws
  // status columns; a task axis such as workflow would be rejected later.
  if (query.entityType === 'project') {
    const requested = groupBy ?? query.groupBy;
    const projectGroupBy = nextLayout === 'board' || requested === 'status' ? 'status' : 'none';
    return {
      ...query,
      groupBy: projectGroupBy,
      layout: nextLayout === 'board' ? 'board' : 'list',
      subGroupBy: undefined,
    };
  }
  if (nextLayout !== 'board') {
    const nextGroupBy = groupBy ?? query.groupBy;
    if (nextGroupBy === 'none') {
      return { ...query, groupBy: 'none', layout: 'list', subGroupBy: undefined };
    }
    const kept = nextGroupBy && LIST_GROUP_BY.has(nextGroupBy) ? nextGroupBy : 'status';
    const subGroupBy = normalizeWorkQuerySubGroupBy(kept, query.subGroupBy);
    return { ...query, groupBy: kept, layout: 'list', subGroupBy };
  }
  const nextGroupBy = groupBy ?? query.groupBy ?? 'workflowCategory';
  const boardGroupBy = BOARD_GROUP_BY.has(nextGroupBy) ? nextGroupBy : 'workflowCategory';
  const subGroupBy = normalizeWorkQuerySubGroupBy(boardGroupBy, query.subGroupBy);
  return {
    ...query,
    groupBy: boardGroupBy,
    layout: 'board',
    subGroupBy,
  };
};

export type WorkQueryBoardDimension =
  | 'activityDate'
  | 'agent'
  | 'assignee'
  | 'attention'
  | 'cycle'
  | 'milestone'
  | 'priority'
  | 'project'
  | 'status'
  | 'workflowCategory';

export const workQueryBoardGroupBy = (query: WorkQuery): WorkQueryBoardDimension | undefined => {
  if (query.layout === 'board') {
    if (
      query.groupBy === 'status' ||
      query.groupBy === 'priority' ||
      query.groupBy === 'assignee' ||
      query.groupBy === 'agent' ||
      query.groupBy === 'attention'
    ) {
      return query.groupBy;
    }
    return 'workflowCategory';
  }
  if (query.groupBy && query.groupBy !== 'none' && LIST_GROUP_BY.has(query.groupBy)) {
    return query.groupBy;
  }
  return undefined;
};

/** Reject a time zone Postgres would not accept. Missing means UTC. */
export const assertWorkQueryTimeZone = (timeZone: string | undefined): string => {
  const zone = timeZone?.trim() || 'UTC';
  if (zone.length > 100) throw new WorkQueryError('INVALID_QUERY', 'Invalid time zone');
  try {
    Intl.DateTimeFormat(undefined, { timeZone: zone });
  } catch {
    throw new WorkQueryError('INVALID_QUERY', 'Invalid time zone');
  }
  return zone;
};

/**
 * The blocked side of a `blocks` edge inside the attention EXISTS leg. The
 * alias is declared in the raw `INNER JOIN` clause; its columns resolve to
 * `attention_blocked.*` so the readability predicates bind to the downstream
 * task, not the grouped row.
 */
const attentionBlockedTasks = alias(tasks, 'attention_blocked');

/** A done/canceled blocked row no longer needs the blocker. */
const ATTENTION_OPEN_ALIAS_WORKFLOW = sql`${attentionBlockedTasks.workflowCategory} NOT IN ('done', 'canceled')`;

/**
 * Linear's My issues grouping: urgent issues first, then issues that block
 * others, then the rest by workflow state (Linear's status is the workflow
 * state — Todo, In Progress… — not the agent run state, so the tail buckets
 * match the one status mark each row draws). Not a stored column — a CASE over
 * `priority` and a live `blocks` edge, so the bucket always reflects the
 * current graph.
 *
 * Two guards keep the buckets honest:
 * - The grouped row itself must be open — a completed/canceled issue stays
 *   in its workflow bucket even when it is urgent or still blocks work.
 * - The blocked downstream task must be readable by the caller — otherwise
 *   an invisible task could flip a visible one into the `blocking` group.
 */
const attentionGroupExpr = (ctx: {
  db: OrviloDatabase;
  userId: string;
  workspaceId?: string;
}): SQL<string> =>
  sql<string>`CASE
  WHEN ${taskAttentionReasonExpr} = 'needs_input' THEN 'needs_input'
  WHEN ${TASK_OPEN_WORKFLOW} AND ${tasks.priority} = 1 THEN 'urgent'
  WHEN ${TASK_OPEN_WORKFLOW} AND EXISTS (
    SELECT 1
    FROM ${taskDependencies} attention_dep
    INNER JOIN ${tasks} attention_blocked
      ON attention_dep.task_id = ${attentionBlockedTasks.id}
    WHERE attention_dep.depends_on_id = ${tasks.id}
      AND attention_dep.type = 'blocks'
      AND ${ATTENTION_OPEN_ALIAS_WORKFLOW}
      AND ${buildTaskReadableWhere(ctx.db, { userId: ctx.userId, workspaceId: ctx.workspaceId }, attentionBlockedTasks as unknown as typeof tasks)}
  ) THEN 'blocking'
  ELSE ${tasks.workflowCategory}
END`;

type BoardLaneAxis =
  'agent' | 'assignee' | 'milestone' | 'priority' | 'project' | 'status' | 'workflowCategory';

/**
 * Local-day recency buckets matching `activityBucketKey`: day:0–6, then
 * week / month / year. `dayDiff` is the calendar-day distance in `timeZone`.
 */
const activityDateExpr = (activity: SQL, timeZone: string): SQL => {
  const dayDiff = sql`((timezone(${timeZone}, now()))::date - (timezone(${timeZone}, ${activity}))::date)`;
  return sql`CASE
    WHEN ${activity} IS NULL THEN 'unknown'
    WHEN GREATEST(0, ${dayDiff}) < 7 THEN 'day:' || GREATEST(0, ${dayDiff})::text
    WHEN ${dayDiff} < 30 THEN 'week:' || (${dayDiff} / 7)::text
    WHEN ${dayDiff} < 365 THEN 'month:' || (${dayDiff} / 30)::text
    ELSE 'year:' || (${dayDiff} / 365)::text
  END`;
};

const axisExpr = (
  axis: WorkQueryBoardDimension | BoardLaneAxis,
  ctx: { activity: SQL; attention: SQL; timeZone: string },
): SQL => {
  switch (axis) {
    case 'activityDate': {
      return activityDateExpr(ctx.activity, ctx.timeZone);
    }
    case 'attention': {
      return ctx.attention;
    }
    case 'status': {
      return legacyStatusExpr;
    }
    case 'workflowCategory': {
      return sql`${tasks.workflowCategory}`;
    }
    case 'priority': {
      return sql`coalesce(${tasks.priority}::text, '0')`;
    }
    case 'assignee': {
      return sql`coalesce(${tasks.assigneeUserId}, 'none')`;
    }
    case 'agent': {
      return sql`coalesce(${tasks.assigneeAgentId}, 'none')`;
    }
    case 'milestone': {
      return sql`coalesce(${tasks.projectMilestoneId}::text, 'none')`;
    }
    case 'cycle': {
      return sql`coalesce(${tasks.cycleRefId}::text, 'none')`;
    }
    case 'project': {
      return sql`coalesce(${tasks.projectId}, 'none')`;
    }
  }
};

/** Finite axes keep their empty buckets. Assignee and project only return keys that exist. */
const finiteBoardKeys = (axis: string): readonly string[] | undefined => {
  if (axis === 'attention')
    return ['needs_input', 'urgent', 'blocking', ...WORK_QUERY_WORKFLOW_COLUMNS];
  if (axis === 'status') return WORK_QUERY_STATUS_COLUMNS;
  if (axis === 'workflowCategory') return [...WORK_QUERY_WORKFLOW_COLUMNS];
  if (axis === 'priority') return WORK_QUERY_PRIORITY_KEYS;
  return undefined;
};

const stableBoardKeys = (groupBy: string, lane?: string): readonly string[] => {
  const columns = finiteBoardKeys(groupBy);
  if (!lane) return columns ?? [];
  const lanes = finiteBoardKeys(lane);
  if (!columns || !lanes) return [];
  return columns.flatMap((column) =>
    lanes.map((laneKey) => `${column}${WORK_QUERY_BOARD_KEY_SEP}${laneKey}`),
  );
};

/**
 * Board swimlanes keep every finite cell, including empties. A list keeps
 * finite primary columns and, when a lane is set, only the cells that have
 * rows — plus a bare column key when a finite column has no children.
 */
const listGroupKeys = (
  groupBy: string,
  lane: string | undefined,
  countKeys: readonly string[],
  includeEmptyLanes: boolean,
): string[] => {
  if (includeEmptyLanes) return [...stableBoardKeys(groupBy, lane)];
  if (!lane) return [...(finiteBoardKeys(groupBy) ?? [])];
  const columns = finiteBoardKeys(groupBy);
  if (!columns) return [];
  const bare: string[] = [];
  for (const column of columns) {
    const prefix = `${column}${WORK_QUERY_BOARD_KEY_SEP}`;
    if (!countKeys.some((key) => key.startsWith(prefix))) bare.push(column);
  }
  return bare;
};

/** Keyset for board-ordered groups: position asc, then createdAt/seq desc —
 * the same total order TASK_BOARD_ORDER applies on the task-store board.
 * Cursor columns stay in SQL so timestamp equality is exact. */
const keysetAfterBoardPosition = (afterId: string): SQL => {
  const cursorPos = sql`(SELECT ${taskEffectivePosition} FROM ${tasks} WHERE ${tasks.id} = ${afterId})`;
  const cursorCreated = sql`(SELECT ${tasks.createdAt} FROM ${tasks} WHERE ${tasks.id} = ${afterId})`;
  const cursorSeq = sql`(SELECT ${tasks.seq} FROM ${tasks} WHERE ${tasks.id} = ${afterId})`;
  return or(
    sql`${taskEffectivePosition} > ${cursorPos}`,
    and(
      sql`${taskEffectivePosition} IS NOT DISTINCT FROM ${cursorPos}`,
      sql`${tasks.createdAt} < ${cursorCreated}`,
    ),
    and(
      sql`${taskEffectivePosition} IS NOT DISTINCT FROM ${cursorPos}`,
      sql`${tasks.createdAt} IS NOT DISTINCT FROM ${cursorCreated}`,
      sql`${tasks.seq} < ${cursorSeq}`,
    ),
  )!;
};

const externalReviewTitle = (summary: unknown, actionType: string) => {
  if (summary && typeof summary === 'object' && 'title' in summary) {
    const title = (summary as { title?: unknown }).title;
    if (typeof title === 'string' && title.trim()) return title;
  }
  return actionType;
};

/** Same allowlist as Inbox action URLs: https GitHub / Linear only. */
export const externalReviewOpenUrl = (targetId: string | null | undefined): string | null => {
  if (!targetId) return null;
  const trimmed = targetId.trim();
  if (!trimmed) return null;
  for (const char of trimmed) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f || char === '\\') return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    if (!isWorkAttentionAllowedHttpsHost(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

const DEFAULT_TASK_SORT: WorkQuerySort[] = [
  { direction: 'desc', field: 'updatedAt' },
  { direction: 'asc', field: 'id' },
];

const normalizeTaskSort = (sort: WorkQuerySort[] | undefined): WorkQuerySort[] => {
  const next = sort?.length ? [...sort] : [...DEFAULT_TASK_SORT];
  if (
    next.some(
      (item) =>
        item.field === 'delegatedByUserId' ||
        item.field === 'labelId' ||
        item.field === 'reviewerUserId',
    )
  ) {
    throw new WorkQueryError('INVALID_QUERY', 'Cannot sort by a virtual field');
  }
  if (next.at(-1)?.field !== 'id') {
    next.push({ direction: 'asc', field: 'id' });
  }
  return next;
};

const sortColumn = (field: WorkQuerySort['field']) => {
  if (field === 'updatedAt') return tasks.updatedAt;
  if (field === 'createdAt') return tasks.createdAt;
  if (field === 'name') return tasks.name;
  if (field === 'id') return tasks.id;
  return taskColumn(field);
};

/**
 * Keyset against the cursor row in SQL. A Date round-trip drops microseconds,
 * so two rows that share `now()` stop looking equal and the next page is empty.
 * ASC is NULLS LAST; DESC is NULLS FIRST — the same order Postgres applies.
 */
const keysetAfterCursor = (
  sort: WorkQuerySort[],
  columnFor: (field: WorkQuerySort['field']) => SQLWrapper,
  idColumn: AnyPgColumn,
  afterId: string,
): SQL => {
  const cursorValue = (field: WorkQuerySort['field']) => {
    const column = columnFor(field);
    return sql`(SELECT ${column} FROM ${idColumn.table} WHERE ${idColumn} = ${afterId})`;
  };
  const parts: SQL[] = [];
  for (let index = 0; index < sort.length; index += 1) {
    const equalities: SQL[] = [];
    for (let prior = 0; prior < index; prior += 1) {
      const field = sort[prior]!.field;
      equalities.push(sql`${columnFor(field)} IS NOT DISTINCT FROM ${cursorValue(field)}`);
    }
    const current = sort[index]!;
    const column = columnFor(current.field);
    const cursor = cursorValue(current.field);
    const beyond =
      current.direction === 'asc'
        ? sql`(${column} > ${cursor} OR (${cursor} IS NOT NULL AND ${column} IS NULL))`
        : sql`(${column} < ${cursor} OR (${cursor} IS NULL AND ${column} IS NOT NULL))`;
    parts.push(
      equalities.length > 0 ? sql`(${sql.join(equalities, sql` AND `)} AND ${beyond})` : beyond,
    );
  }
  return parts.length > 0 ? sql`(${sql.join(parts, sql` OR `)})` : sql`false`;
};

const taskActivityAtFor = (userId: string, taskId: SQL | string) =>
  sql`(select max(coalesce(${notifications.lastActivityAt}, ${notifications.createdAt}))
    from ${notifications}
    where ${notifications.userId} = ${userId}
      and ${notifications.resourceType} = 'task'
      and ${notifications.resourceId} = ${taskId})`;

/** Compare an ordering expression to the same expression on the cursor row. */
const keysetAfterExpr = (expr: SQL, cursorExpr: SQL, afterId: string): SQL =>
  or(
    sql`${expr} < ${cursorExpr}`,
    and(sql`${expr} IS NOT DISTINCT FROM ${cursorExpr}`, gt(tasks.id, afterId)),
  )!;

const PROJECT_SORT_FIELDS = new Set<WorkQuerySort['field']>([
  'createdAt',
  'id',
  'name',
  'status',
  'updatedAt',
]);

const DEFAULT_PROJECT_SORT: WorkQuerySort[] = [
  { direction: 'desc', field: 'updatedAt' },
  { direction: 'asc', field: 'id' },
];

const normalizeProjectSort = (sort: WorkQuerySort[] | undefined): WorkQuerySort[] => {
  const next = sort?.length ? [...sort] : [...DEFAULT_PROJECT_SORT];
  for (const item of next) {
    if (!PROJECT_SORT_FIELDS.has(item.field)) {
      throw new WorkQueryError('INVALID_QUERY', `Cannot sort projects by ${item.field}`);
    }
  }
  if (next.at(-1)?.field !== 'id') {
    next.push({ direction: 'asc', field: 'id' });
  }
  return next;
};

const PROJECT_OPTION_SORT: WorkQuerySort[] = [
  { direction: 'desc', field: 'updatedAt' },
  { direction: 'asc', field: 'id' },
];

const projectSortColumn = (field: WorkQuerySort['field']) => {
  switch (field) {
    case 'createdAt': {
      return projects.createdAt;
    }
    case 'id': {
      return projects.id;
    }
    case 'name': {
      return projects.name;
    }
    case 'status': {
      return projects.status;
    }
    case 'updatedAt': {
      return projects.updatedAt;
    }
    default: {
      throw new WorkQueryError('INVALID_QUERY', `Cannot sort projects by ${field}`);
    }
  }
};

export class WorkQueryModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  private ownership = () =>
    buildTaskReadableWhere(this.db, { userId: this.userId, workspaceId: this.workspaceId });

  private listReadableTeamIds = async (): Promise<Set<string>> => {
    if (!this.workspaceId) return new Set();
    const rows = await new TeamModel(this.db, this.userId, this.workspaceId).listReadable();
    return new Set(rows.map((row) => row.id));
  };

  /**
   * Batch-hydrate label chips for a page of task rows — one `IN` query through
   * the label registry, grouped by task. Keeping it off the main SELECT means
   * a multi-labeled task is never duplicated per binding.
   */
  private taskLabelsByTaskIds = async (
    taskIds: string[],
  ): Promise<Map<string, TaskLabelSummary[]>> => {
    const byTask = await new TaskLabelModel(this.db, this.userId, this.workspaceId).listForTasks(
      taskIds,
    );
    return new Map(
      [...byTask.entries()].map(([taskId, labels]) => [taskId, labels.map(toTaskLabelSummary)]),
    );
  };

  /**
   * Batch-hydrate the parent breadcrumb for a page of task rows. The parent
   * read reuses the list's own ownership + team-readability predicates, so a
   * parent the caller cannot read hydrates to `null` instead of leaking its
   * title.
   */
  private taskParentsByIds = async (
    parentIds: (null | string)[],
  ): Promise<Map<string, { identifier: string; name: null | string }>> => {
    const ids = [...new Set(parentIds.filter((id): id is string => Boolean(id)))];
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ id: tasks.id, identifier: tasks.identifier, name: tasks.name })
      .from(tasks)
      .where(and(inArray(tasks.id, ids), this.ownership()));
    return new Map(rows.map((row) => [row.id, { identifier: row.identifier, name: row.name }]));
  };

  /** Labels + parent breadcrumb for a page of rows, in two batched reads. */
  private hydrateTaskRows = async <T extends { id: string; parentTaskId: null | string }>(
    rows: T[],
  ) => {
    const [labelsByTask, parentsById, statusById] = await Promise.all([
      this.taskLabelsByTaskIds(rows.map((row) => row.id)),
      this.taskParentsByIds(rows.map((row) => row.parentTaskId)),
      this.derivedTaskStatusByIds(rows.map((row) => row.id)),
    ]);
    return rows.map((row) => ({
      ...row,
      labels: labelsByTask.get(row.id) ?? [],
      parent: row.parentTaskId ? (parentsById.get(row.parentTaskId) ?? null) : null,
      // Deprecated wire field — derived from canonical workflow/execution
      // rows, never the stored `tasks.status` value.
      status: statusById.get(row.id)?.status ?? 'backlog',
      dispatchPhase: statusById.get(row.id)?.dispatchPhase ?? null,
      hasLiveExecutor: statusById.get(row.id)?.hasLiveExecutor ?? false,
      attentionReason: statusById.get(row.id)?.attentionReason ?? 'none',
      parkedReason: statusById.get(row.id)?.parkedReason ?? null,
    }));
  };

  private derivedTaskStatusByIds = async (ids: string[]) => {
    if (ids.length === 0)
      return new Map<
        string,
        {
          status: TaskStatus;
          dispatchPhase: TaskDispatchPhase | null;
          hasLiveExecutor: boolean;
          attentionReason: TaskAttentionReason;
          parkedReason: string | null;
        }
      >();
    const rows = await this.db
      .select({
        id: tasks.id,
        status: sql<TaskStatus>`${legacyStatusExpr}`,
        dispatchPhase: sql<TaskDispatchPhase | null>`${latestDispatchPhase}`,
        hasLiveExecutor: sql<boolean>`${hasLiveTaskExecutor}`,
        attentionReason: taskAttentionReasonExpr,
        parkedReason: sql<string | null>`${tasks.context} #>> '{execution,parked,reason}'`,
      })
      .from(tasks)
      .where(and(inArray(tasks.id, ids), this.ownership()));
    return new Map(rows.map(({ id, ...state }) => [id, state]));
  };

  private compileCtx = (
    entityType: WorkQueryEntityType,
    readableTeamIds: ReadonlySet<string>,
  ): CompileCtx => ({
    currentUserId: this.userId,
    entityType,
    readableTeamIds,
  });

  private taskConditions = (
    query: WorkQuery,
    mode: MyWorkMode | undefined,
    readableTeamIds: ReadonlySet<string>,
  ) => {
    const conditions: SQL[] = [this.ownership()];
    const filterSql = compileFilter(query.filter, this.compileCtx('task', readableTeamIds));
    if (filterSql) conditions.push(filterSql);
    if (mode === 'subscribed') {
      conditions.push(
        sql`exists (select 1 from ${taskSubscriptions} where ${taskSubscriptions.taskId} = ${tasks.id} and ${taskSubscriptions.userId} = ${this.userId} and ${taskSubscriptions.unsubscribedAt} is null)`,
      );
    }
    if (mode === 'activity') {
      conditions.push(
        sql`exists (select 1 from ${notifications} where ${notifications.userId} = ${this.userId} and ${notifications.resourceType} = 'task' and ${notifications.resourceId} = ${tasks.id})`,
      );
    }
    return conditions;
  };

  /**
   * Latest real activity on a task for the caller — the notification episode's
   * `lastActivityAt` (actor/verb/subject live on the notification row). Falls
   * back to the row's createdAt when a legacy notification has no activity
   * stamp; the EXISTS in `taskConditions` guarantees at least one row.
   */
  private taskActivityAt = () =>
    sql`(select max(coalesce(${notifications.lastActivityAt}, ${notifications.createdAt})) from ${notifications} where ${notifications.userId} = ${this.userId} and ${notifications.resourceType} = 'task' and ${notifications.resourceId} = ${tasks.id})`;

  queryTasks = async (params: {
    afterId?: string;
    groupKey?: string;
    limit?: number;
    mode?: MyWorkMode;
    query: WorkQuery;
    queryHash?: string;
  }) => {
    const query = normalizeWorkQuery(params.query);
    validateWorkQuery(query);
    if (query.entityType !== 'task') {
      throw new WorkQueryError('INVALID_QUERY', 'This kernel currently runs task queries');
    }

    const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
    const readableTeamIds = filterHasTeamId(query.filter)
      ? await this.listReadableTeamIds()
      : new Set<string>();
    const conditions = this.taskConditions(query, params.mode, readableTeamIds);
    const queryHash = hashQuery(query);
    const sort = normalizeTaskSort(query.sort);
    const groupBy = workQueryBoardGroupBy(query);

    if (groupBy) {
      const lane = normalizeWorkQuerySubGroupBy(groupBy, query.subGroupBy);
      const board = query.layout === 'board';
      return this.queryTaskBoard({
        afterId: params.afterId,
        conditions,
        groupBy,
        groupKey: params.groupKey,
        includeEmptyLanes: board,
        lane,
        layout: board ? 'board' : 'list',
        // Board swimlanes page 10 cards per cell. List sub-groups page 25.
        limit: lane ? Math.min(limit, board ? 10 : 25) : limit,
        mode: params.mode,
        queryHash,
        requestedHash: params.queryHash,
        sort,
        sortMode: query.sortMode ?? 'manual',
        timeZone: assertWorkQueryTimeZone(query.timeZone),
      });
    }

    const listConditions = [...conditions];
    // Activity mode lists by real activity recency — the latest notification
    // episode on the task — not by the row's updatedAt.
    const activityOrdered = params.mode === 'activity';
    const activityExpr = this.taskActivityAt();

    if (params.afterId) {
      if (!params.queryHash || params.queryHash !== queryHash) {
        throw new WorkQueryError('CURSOR_INVALID', 'CURSOR_INVALID');
      }
      const [cursor] = await this.db
        .select()
        .from(tasks)
        .where(and(...conditions, eq(tasks.id, params.afterId)))
        .limit(1);
      if (!cursor) {
        throw new WorkQueryError('CURSOR_INVALID', 'CURSOR_INVALID');
      }
      listConditions.push(
        activityOrdered
          ? keysetAfterExpr(
              activityExpr,
              taskActivityAtFor(this.userId, params.afterId),
              params.afterId,
            )
          : keysetAfterCursor(sort, sortColumn, tasks.id, params.afterId),
      );
    }

    const orderBy = activityOrdered
      ? [desc(activityExpr), asc(tasks.id)]
      : sort.map((item) =>
          item.direction === 'desc' ? desc(sortColumn(item.field)) : asc(sortColumn(item.field)),
        );

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(and(...conditions));

    // Activity rows carry the timestamp they are ordered by, so the client's
    // day buckets use the same clock as the order (not the row's updatedAt).
    const rows = await this.db
      .select({
        ...getTableColumns(tasks),
        visibility: taskVisibilitySql(),
        // mapWith: a raw SQL timestamp arrives as a driver string otherwise.
        activityAt: activityOrdered
          ? sql<Date | null>`${activityExpr}`.mapWith(tasks.updatedAt)
          : sql<Date | null>`null`,
      })
      .from(tasks)
      .where(and(...listConditions))
      .orderBy(...orderBy)
      .limit(limit);

    const hydrated = await this.hydrateTaskRows(rows);

    return {
      groupBy: 'none' as const,
      groups: undefined,
      layout: 'list' as const,
      queryHash,
      tasks: hydrated,
      total: Number(countRow?.count ?? 0),
    };
  };

  /**
   * Server-side board: each column is filtered and paged in the database.
   * Totals cover the full matching set, not the current page. Parent and
   * child tasks that match the filter both appear — grouping never drops
   * subtasks.
   */
  private queryTaskBoard = async (params: {
    afterId?: string;
    conditions: SQL[];
    groupBy: WorkQueryBoardDimension;
    groupKey?: string;
    includeEmptyLanes: boolean;
    lane?: BoardLaneAxis;
    layout: WorkQueryLayout;
    limit: number;
    mode?: MyWorkMode;
    queryHash: string;
    requestedHash?: string;
    sort: WorkQuerySort[];
    sortMode: 'field' | 'manual';
    timeZone: string;
  }) => {
    if (params.afterId && !params.groupKey) {
      throw new WorkQueryError('CURSOR_INVALID', 'CURSOR_INVALID');
    }
    if (params.afterId && (!params.requestedHash || params.requestedHash !== params.queryHash)) {
      throw new WorkQueryError('CURSOR_INVALID', 'CURSOR_INVALID');
    }

    // Raw dimension keys everywhere — no folding into Cordy columns, so an
    // in-review issue never lands in a needs-input run-state bucket. The
    // grouping dimension is an expression, not always a stored column —
    // 'attention' derives urgent/blocking from priority + live blocks edges.
    const attention = attentionGroupExpr({
      db: this.db,
      userId: this.userId,
      workspaceId: this.workspaceId,
    });
    const axisCtx = {
      activity: sql`coalesce(${this.taskActivityAt()}, ${tasks.updatedAt})`,
      attention,
      timeZone: params.timeZone,
    };
    const columnExpr = axisExpr(params.groupBy, axisCtx);
    const dimension = params.lane
      ? sql`${columnExpr} || E'\\x1f' || ${axisExpr(params.lane, axisCtx)}`
      : columnExpr;
    const matchesKey = (key: string): SQL => sql`${dimension} = ${key}`;
    // Group over a derived `key` column: the dimension may carry params
    // (attention's NOT-IN list), and Postgres won't match a SELECT CASE whose
    // placeholders differ from the GROUP BY one's.
    const keyed = this.db.$with('keyed_tasks').as(
      this.db
        .select({ id: tasks.id, key: sql<string>`${dimension}`.as('key') })
        .from(tasks)
        .where(and(...params.conditions)),
    );
    const countRows = await this.db
      .with(keyed)
      .select({ count: sql<number>`count(*)`, key: keyed.key })
      .from(keyed)
      .groupBy(keyed.key);

    const countByKey = new Map<string, number>();
    for (const row of countRows) {
      countByKey.set(String(row.key), Number(row.count));
    }
    const total = [...countByKey.values()].reduce((sum, count) => sum + count, 0);

    const stable = listGroupKeys(
      params.groupBy,
      params.lane,
      [...countByKey.keys()],
      params.includeEmptyLanes,
    );
    const extra = [...countByKey.keys()]
      .filter((key) => !(stable as readonly string[]).includes(key))
      .sort();
    const totalsKeys = [...stable, ...extra];
    // A column page returns only that column. Sibling groups stay on the
    // client; echoing them with an empty page used to flip their hasMore.
    const pageKeys = params.groupKey
      ? totalsKeys.filter((key) => key === params.groupKey)
      : totalsKeys;
    if (params.groupKey && pageKeys.length === 0) {
      throw new WorkQueryError('CURSOR_INVALID', 'CURSOR_INVALID');
    }

    // `manual` board ordering keeps position so a same-column drop persists
    // where the user left it; `field` orders each column by the query's own
    // sort — switching to board never silently overrides it. Activity-date
    // groups, and activity mode off a manual board, use the notification
    // clock the bucket already uses — not the row's updatedAt.
    const boardOrdered = params.layout === 'board' && params.sortMode === 'manual';
    const activityOrdered =
      params.groupBy === 'activityDate' || (params.mode === 'activity' && !boardOrdered);
    const orderBy = activityOrdered
      ? [desc(axisCtx.activity), asc(tasks.id)]
      : boardOrdered
        ? [sql`${taskEffectivePosition} asc`, desc(tasks.createdAt), desc(tasks.seq)]
        : params.sort.map((item) =>
            item.direction === 'desc' ? desc(sortColumn(item.field)) : asc(sortColumn(item.field)),
          );

    const groups = await Promise.all(
      pageKeys.map(async (key) => {
        const groupTotal = countByKey.get(key) ?? 0;

        const groupConditions: SQL[] = [...params.conditions, matchesKey(key)];
        if (params.afterId) {
          const [cursor] = await this.db
            .select()
            .from(tasks)
            .where(and(...groupConditions, eq(tasks.id, params.afterId)))
            .limit(1);
          if (!cursor) {
            throw new WorkQueryError('CURSOR_INVALID', 'CURSOR_INVALID');
          }
          groupConditions.push(
            activityOrdered
              ? keysetAfterExpr(
                  axisCtx.activity,
                  sql`coalesce(
                    ${taskActivityAtFor(this.userId, params.afterId)},
                    (SELECT ${tasks.updatedAt} FROM ${tasks} WHERE ${tasks.id} = ${params.afterId})
                  )`,
                  params.afterId,
                )
              : boardOrdered
                ? keysetAfterBoardPosition(params.afterId)
                : keysetAfterCursor(params.sort, sortColumn, tasks.id, params.afterId),
          );
        }

        const fetched = activityOrdered
          ? await this.db
              .select({
                ...getTableColumns(tasks),
                visibility: taskVisibilitySql(),
                activityAt: sql<Date | null>`${axisCtx.activity}`.mapWith(tasks.updatedAt),
              })
              .from(tasks)
              .where(and(...groupConditions))
              .orderBy(...orderBy)
              .limit(params.limit + 1)
          : await this.db
              .select({ ...getTableColumns(tasks), visibility: taskVisibilitySql() })
              .from(tasks)
              .where(and(...groupConditions))
              .orderBy(...orderBy)
              .limit(params.limit + 1);
        const page = limitPage(fetched, params.limit);

        return {
          hasMore: page.hasMore,
          key,
          tasks: page.rows,
          total: groupTotal,
        };
      }),
    );

    // One hydration pass over every group's page, then split back per group.
    const hydrated = await this.hydrateTaskRows(groups.flatMap((group) => group.tasks));
    const byId = new Map(hydrated.map((row) => [row.id, row]));
    const groupsWithLabels = groups.map((group) => ({
      ...group,
      tasks: group.tasks.map((row) => byId.get(row.id)!),
    }));

    return {
      groupBy: params.groupBy,
      groups: groupsWithLabels,
      layout: params.layout,
      queryHash: params.queryHash,
      tasks: groupsWithLabels.flatMap((group) => group.tasks),
      total,
    };
  };

  /**
   * Readable pending reviews that are not Tasks. Never inserts a Task row.
   */
  /**
   * 'for-me' lists pending reviews where I am the approver; 'created' lists
   * pending reviews I requested. Neither inserts a Task row.
   */
  queryExternalReviews = async (
    scope: 'created' | 'for-me' = 'for-me',
  ): Promise<WorkQueryExternalReview[]> => {
    if (!this.workspaceId) return [];
    const scopeColumn =
      scope === 'created' ? actionApprovals.requestedBy : actionApprovals.approverUserId;
    const rows = await this.db
      .select({
        actionSummary: actionApprovals.actionSummary,
        actionType: actionApprovals.actionType,
        id: actionApprovals.id,
        targetId: actionApprovals.targetId,
        targetType: actionApprovals.targetType,
      })
      .from(actionApprovals)
      .where(
        and(
          eq(actionApprovals.workspaceId, this.workspaceId),
          eq(scopeColumn, this.userId),
          eq(actionApprovals.status, 'pending'),
          isNotNull(actionApprovals.targetType),
          ne(actionApprovals.targetType, 'task'),
        ),
      )
      .limit(50);

    return rows.flatMap((row) => {
      if (!row.targetType) return [];
      return [
        {
          actionType: row.actionType,
          id: row.id,
          openUrl: externalReviewOpenUrl(row.targetId),
          targetId: row.targetId,
          targetType: row.targetType,
          title: externalReviewTitle(row.actionSummary, row.actionType),
        },
      ];
    });
  };

  queryProjects = async (params: {
    afterId?: string;
    groupKey?: string;
    limit?: number;
    query: WorkQuery;
    queryHash?: string;
  }) => {
    const query = normalizeWorkQuery(params.query);
    validateWorkQuery(query);
    if (query.entityType !== 'project') {
      throw new WorkQueryError('INVALID_QUERY', 'entityType must be project');
    }
    if (query.groupBy === 'workflowCategory') {
      throw new WorkQueryError('INVALID_QUERY', 'Projects group by status only');
    }
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
    const conditions: SQL[] = [
      buildProjectReadableWhere(this.db, {
        userId: this.userId,
        workspaceId: this.workspaceId,
      }),
    ];

    const readableTeamIds = filterHasTeamId(query.filter)
      ? await this.listReadableTeamIds()
      : new Set<string>();
    const filterSql = compileFilter(query.filter, this.compileCtx('project', readableTeamIds));
    if (filterSql) conditions.push(filterSql);

    const queryHash = hashQuery(query);
    const sort = normalizeProjectSort(query.sort);
    const orderBy = sort.map((item) =>
      item.direction === 'desc'
        ? desc(projectSortColumn(item.field))
        : asc(projectSortColumn(item.field)),
    );
    const isBoard = query.layout === 'board' || query.groupBy === 'status';
    if (isBoard) {
      if (params.afterId && !params.groupKey) {
        throw new WorkQueryError('CURSOR_INVALID', 'CURSOR_INVALID');
      }
      if (params.afterId && (!queryHash || queryHash !== queryHash)) {
        throw new WorkQueryError('CURSOR_INVALID', 'CURSOR_INVALID');
      }
      const countRows = await this.db
        .select({ count: sql<number>`count(*)`, key: projects.status })
        .from(projects)
        .where(and(...conditions))
        .groupBy(projects.status);
      const countByKey = new Map<string, number>();
      for (const row of countRows) {
        countByKey.set(String(row.key), Number(row.count));
      }
      const total = [...countByKey.values()].reduce((sum, count) => sum + count, 0);
      const extra = [...countByKey.keys()]
        .filter((key) => !(PROJECT_STATUS_VALUES as readonly string[]).includes(key))
        .sort();
      const keys = [...PROJECT_STATUS_VALUES, ...extra];
      const projectGroups = await Promise.all(
        keys.map(async (key) => {
          const groupTotal = countByKey.get(key) ?? 0;
          if (params.groupKey && key !== params.groupKey) {
            return { hasMore: groupTotal > 0, key, projects: [], total: groupTotal };
          }
          const groupConditions: SQL[] = [...conditions, eq(projects.status, key as never)];
          if (params.afterId) {
            const [cursor] = await this.db
              .select()
              .from(projects)
              .where(and(...groupConditions, eq(projects.id, params.afterId)))
              .limit(1);
            if (!cursor) {
              throw new WorkQueryError('CURSOR_INVALID', 'CURSOR_INVALID');
            }
            groupConditions.push(
              keysetAfterCursor(sort, projectSortColumn, projects.id, params.afterId),
            );
          }
          const fetched = await this.db
            .select()
            .from(projects)
            .where(and(...groupConditions))
            .orderBy(...orderBy)
            .limit(limit + 1);
          const page = limitPage(fetched, limit);
          return {
            hasMore: page.hasMore,
            key,
            projects: page.rows,
            total: groupTotal,
          };
        }),
      );
      return {
        groupBy: 'status' as const,
        layout: query.layout === 'board' ? ('board' as const) : ('list' as const),
        projectGroups,
        projects: projectGroups.flatMap((group) => group.projects),
        queryHash,
        total,
      };
    }

    const listConditions = [...conditions];
    if (params.afterId) {
      if (!params.queryHash || params.queryHash !== queryHash) {
        throw new WorkQueryError('CURSOR_INVALID', 'CURSOR_INVALID');
      }
      const [cursor] = await this.db
        .select()
        .from(projects)
        .where(and(...conditions, eq(projects.id, params.afterId)))
        .limit(1);
      if (!cursor) throw new WorkQueryError('CURSOR_INVALID', 'CURSOR_INVALID');
      listConditions.push(keysetAfterCursor(sort, projectSortColumn, projects.id, params.afterId));
    }

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(projects)
      .where(and(...conditions));

    const rows = await this.db
      .select()
      .from(projects)
      .where(and(...listConditions))
      .orderBy(...orderBy)
      .limit(limit);
    return {
      projects: rows,
      queryHash,
      total: Number(countRow?.count ?? 0),
    };
  };

  /** Same ACL as `queryTasks`. Does not download the page. */
  countTasks = async (params: {
    mode?: MyWorkMode;
    query: WorkQuery;
  }): Promise<WorkQueryCountResult> => {
    const query = normalizeWorkQuery(params.query);
    validateWorkQuery(query);
    if (query.entityType !== 'task') {
      throw new WorkQueryError('INVALID_QUERY', 'This kernel currently counts task queries');
    }
    const readableTeamIds = filterHasTeamId(query.filter)
      ? await this.listReadableTeamIds()
      : new Set<string>();
    const conditions = this.taskConditions(query, params.mode, readableTeamIds);
    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(and(...conditions));
    return { queryHash: hashQuery(query), total: Number(countRow?.count ?? 0) };
  };

  /**
   * Same ACL as `queryTasks`. Unreadable team/project ids are counted in
   * `restrictedCount` and never returned as names or guessed keys.
   */
  facetTasks = async (params: {
    field: WorkQueryFacetField;
    mode?: MyWorkMode;
    query: WorkQuery;
  }): Promise<WorkQueryFacetResult> => {
    const query = normalizeWorkQuery(params.query);
    validateWorkQuery(query);
    if (query.entityType !== 'task') {
      throw new WorkQueryError('INVALID_QUERY', 'This kernel currently facets task queries');
    }
    if (!(WORK_QUERY_FACET_FIELDS as readonly string[]).includes(params.field)) {
      throw new WorkQueryError('INVALID_QUERY', `Unknown facet field: ${params.field}`);
    }

    const needsTeams = params.field === 'teamId' || filterHasTeamId(query.filter);
    const readableTeams = needsTeams
      ? this.workspaceId
        ? await new TeamModel(this.db, this.userId, this.workspaceId).listReadable()
        : []
      : [];
    const readableTeamIds = new Set(readableTeams.map((row) => row.id));
    const conditions = this.taskConditions(query, params.mode, readableTeamIds);
    const column =
      params.field === 'projectId'
        ? tasks.projectId
        : params.field === 'teamId'
          ? tasks.teamId
          : params.field === 'status'
            ? legacyStatusExpr
            : tasks.workflowCategory;

    const rows = await this.db
      .select({ count: sql<number>`count(*)`, key: column })
      .from(tasks)
      .where(and(...conditions))
      .groupBy(column);

    const total = rows.reduce((sum, row) => sum + Number(row.count), 0);
    const queryHash = hashQuery(query);

    if (params.field === 'status' || params.field === 'workflowCategory') {
      return {
        buckets: rows
          .map((row) => ({
            count: Number(row.count),
            key: row.key == null ? null : String(row.key),
          }))
          .sort((left, right) => (left.key ?? '').localeCompare(right.key ?? '')),
        field: params.field,
        queryHash,
        restrictedCount: 0,
        total,
      };
    }

    const names = new Map<string, string>();
    if (params.field === 'teamId') {
      for (const team of readableTeams) names.set(team.id, team.name);
    } else {
      const ids = rows.flatMap((row) => (row.key == null ? [] : [String(row.key)]));
      const readableProjects = await new ProjectModel(
        this.db,
        this.userId,
        this.workspaceId,
      ).findByIds(ids);
      for (const project of readableProjects) names.set(project.id, project.name);
    }

    let restrictedCount = 0;
    const buckets: WorkQueryFacetBucket[] = [];
    for (const row of rows) {
      const count = Number(row.count);
      if (row.key == null) {
        buckets.push({ count, key: null });
        continue;
      }
      const key = String(row.key);
      const name = names.get(key);
      if (name === undefined) {
        restrictedCount += count;
        continue;
      }
      buckets.push({ count, key, name });
    }
    buckets.sort((left, right) =>
      (left.name ?? left.key ?? '').localeCompare(right.name ?? right.key ?? ''),
    );

    return { buckets, field: params.field, queryHash, restrictedCount, total };
  };

  /**
   * Thin name/identifier match for CommandMenu. Not a new FTS entity.
   * Task ACL matches list/Inbox: ownership plus private-team readability.
   */
  searchTasks = async (needle: string, limit = 8) => {
    const q = needle.trim();
    if (!q) return [];
    const pattern = `%${escapeLike(q)}%`;
    return this.db
      .select({
        createdAt: tasks.createdAt,
        id: tasks.id,
        identifier: tasks.identifier,
        name: tasks.name,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .where(
        and(
          this.ownership(),
          or(
            sql`${tasks.name} ILIKE ${pattern} ESCAPE '\\'`,
            sql`${tasks.identifier} ILIKE ${pattern} ESCAPE '\\'`,
          ),
        ),
      )
      .orderBy(desc(tasks.updatedAt), asc(tasks.id))
      .limit(Math.min(Math.max(limit, 1), WORK_SEARCH_MAX_PER_TYPE));
  };

  /** Name match for CommandMenu. Project ACL matches `ProjectModel.readable`. */
  searchProjects = async (needle: string, limit = 8) => {
    const q = needle.trim();
    if (!q) return [];
    const pattern = `%${escapeLike(q)}%`;
    const conditions: SQL[] = [
      buildProjectReadableWhere(this.db, {
        userId: this.userId,
        workspaceId: this.workspaceId,
      }),
      sql`${projects.name} ILIKE ${pattern} ESCAPE '\\'`,
    ];
    return this.db
      .select({
        createdAt: projects.createdAt,
        id: projects.id,
        name: projects.name,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(and(...conditions))
      .orderBy(desc(projects.updatedAt), asc(projects.id))
      .limit(Math.min(Math.max(limit, 1), WORK_SEARCH_MAX_PER_TYPE));
  };

  /**
   * Picker options for `projectId` filter rows: authorized name search with
   * keyset pagination (`afterId`), or an authorized id lookup (`ids`) to
   * hydrate already-selected values that are not on the current page.
   */
  searchProjectOptions = async (params: {
    afterId?: string;
    ids?: string[];
    limit?: number;
    needle?: string;
  }) => {
    const limit = Math.min(Math.max(params.limit ?? 25, 1), WORK_SEARCH_MAX_PER_TYPE);
    const readable = buildProjectReadableWhere(this.db, {
      userId: this.userId,
      workspaceId: this.workspaceId,
    });
    if (params.ids?.length) {
      const rows = await this.db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(and(readable, inArray(projects.id, params.ids.slice(0, 50))))
        .orderBy(desc(projects.updatedAt), asc(projects.id));
      return { items: rows, nextCursor: null };
    }

    const conditions: SQL[] = [readable];
    const needle = params.needle?.trim();
    if (needle) {
      conditions.push(sql`${projects.name} ILIKE ${`%${escapeLike(needle)}%`} ESCAPE '\\'`);
    }
    if (params.afterId) {
      const [cursor] = await this.db
        .select()
        .from(projects)
        .where(and(readable, eq(projects.id, params.afterId)))
        .limit(1);
      if (!cursor) throw new WorkQueryError('CURSOR_INVALID', 'CURSOR_INVALID');
      conditions.push(
        keysetAfterCursor(PROJECT_OPTION_SORT, projectSortColumn, projects.id, params.afterId),
      );
    }
    const rows = await this.db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(...conditions))
      .orderBy(desc(projects.updatedAt), asc(projects.id))
      .limit(limit + 1);
    const items = rows.slice(0, limit);
    return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
  };

  /**
   * Cycle picker options in a single authorized query — never a per-team
   * fan-out. `teamId` narrows to one readable team (an unreadable or foreign
   * team returns nothing rather than leaking); `ids` hydrates selected values.
   */
  listCycleOptions = async (params: {
    ids?: string[];
    limit?: number;
    needle?: string;
    teamId?: string;
  }) => {
    if (!this.workspaceId) return [];
    const readableTeamIds = await this.listReadableTeamIds();
    const teamIds = params.teamId
      ? readableTeamIds.has(params.teamId)
        ? [params.teamId]
        : []
      : [...readableTeamIds];
    if (teamIds.length === 0) return [];

    const conditions: SQL[] = [
      eq(teamCycles.workspaceId, this.workspaceId),
      inArray(teamCycles.teamId, teamIds),
    ];
    if (params.ids?.length) {
      conditions.push(inArray(teamCycles.id, params.ids.slice(0, 50)));
    } else {
      const needle = params.needle?.trim();
      if (needle) {
        conditions.push(sql`${teamCycles.name} ILIKE ${`%${escapeLike(needle)}%`} ESCAPE '\\'`);
      }
    }
    const limit = Math.min(Math.max(params.limit ?? 100, 1), WORK_SEARCH_MAX_PER_TYPE);
    return this.db
      .select({
        endsAt: teamCycles.endsAt,
        id: teamCycles.id,
        name: teamCycles.name,
        number: teamCycles.number,
        startsAt: teamCycles.startsAt,
        teamId: teamCycles.teamId,
        teamName: teams.name,
      })
      .from(teamCycles)
      .leftJoin(teams, eq(teams.id, teamCycles.teamId))
      .where(and(...conditions))
      .orderBy(asc(teams.name), desc(teamCycles.startsAt), asc(teamCycles.id))
      .limit(limit);
  };
}
