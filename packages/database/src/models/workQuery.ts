import type {
  MyWorkMode,
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
  WORK_QUERY_FACET_FIELDS,
  WORK_QUERY_MAX_DEPTH,
  WORK_QUERY_MAX_IN_VALUES,
  WORK_QUERY_MAX_PREDICATES,
  WORK_QUERY_STATUS_COLUMNS,
  WORK_QUERY_WORKFLOW_COLUMNS,
  WORK_SEARCH_MAX_PER_TYPE,
} from '@orvilo/types';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  notInArray,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { actionApprovals } from '../schemas/actionApproval';
import { executionGrants } from '../schemas/executionGrant';
import { projects } from '../schemas/project';
import { tasks } from '../schemas/task';
import { projectTeams } from '../schemas/team';
import { taskSubscriptions } from '../schemas/workAttention';
import type { OrviloDatabase } from '../type';
import { buildProjectReadableWhere } from '../utils/projectReadable';
import { buildTaskTeamReadableWhere } from '../utils/taskTeamReadable';
import { buildWorkspaceWhere } from '../utils/workspace';
import { ProjectModel } from './project';
import { taskEffectivePosition } from './task';
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
  'assigneeUserId',
  'createdByUserId',
  'cycleId',
  'delegatedByUserId',
  'id',
  'priority',
  'projectId',
  'reviewerUserId',
  'status',
  'teamId',
  'triageStatus',
  'workflowCategory',
]);

const PROJECT_FIELDS = new Set<WorkQueryField>(['id', 'teamId']);

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

const assertInValues = (resolved: unknown, op: 'in' | 'notIn'): string[] => {
  if (!Array.isArray(resolved) || resolved.length === 0) {
    throw new WorkQueryError('INVALID_QUERY', `${op} requires a non-empty array`);
  }
  if (resolved.length > WORK_QUERY_MAX_IN_VALUES) {
    throw new WorkQueryError('QUERY_TOO_COMPLEX', `${op} exceeded maximum values`);
  }
  return resolved as string[];
};

const compileTeamIdColumnPredicate = (
  column: AnyPgColumn,
  op: WorkQueryOp,
  resolved: ReturnType<typeof resolveValue>,
  readableTeamIds: ReadonlySet<string>,
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
      const kept = assertInValues(resolved, 'in').filter(
        (item): item is string => typeof item === 'string' && readableTeamIds.has(item),
      );
      return kept.length ? inArray(column, kept) : FALSE_SQL;
    }
    case 'neq': {
      if (typeof resolved !== 'string' || !readableTeamIds.has(resolved)) return TRUE_SQL;
      return ne(column, resolved as never);
    }
    case 'notIn': {
      const kept = assertInValues(resolved, 'notIn').filter(
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
    case 'assigneeUserId': {
      return tasks.assigneeUserId;
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
    case 'priority': {
      return tasks.priority;
    }
    case 'projectId': {
      return tasks.projectId;
    }
    case 'reviewerUserId': {
      return tasks.reviewerUserId;
    }
    case 'status': {
      return tasks.status;
    }
    case 'teamId': {
      return tasks.teamId;
    }
    case 'triageStatus': {
      return tasks.triageStatus;
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
  column: AnyPgColumn,
  op: WorkQueryOp,
  resolved: ReturnType<typeof resolveValue>,
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
      return inArray(column, assertInValues(resolved, 'in') as never[]);
    }
    case 'notIn': {
      return notInArray(column, assertInValues(resolved, 'notIn') as never[]);
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
    );
  }

  const op: WorkQueryOp = predicate.op;
  const resolved = resolveValue(predicate.value, ctx.currentUserId);
  return compileColumnPredicate(taskColumn(predicate.field), op, resolved);
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
  if (query.schemaVersion !== 1) {
    throw new WorkQueryError('INVALID_QUERY', 'Unsupported schemaVersion');
  }
  if (query.entityType !== 'task' && query.entityType !== 'project') {
    throw new WorkQueryError('INVALID_QUERY', 'Unsupported entityType');
  }
  const total = countPredicates(query.filter, 0);
  if (total > WORK_QUERY_MAX_PREDICATES) {
    throw new WorkQueryError('QUERY_TOO_COMPLEX', 'Query exceeded maximum predicates');
  }
};

export const myWorkQueryForMode = (mode: MyWorkMode): WorkQuery => {
  const current = { ref: 'currentUser' as const };
  switch (mode) {
    case 'assigned': {
      return {
        entityType: 'task',
        filter: { all: [{ field: 'assigneeUserId', op: 'eq', value: current }] },
        schemaVersion: 1,
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
        schemaVersion: 1,
      };
    }
    case 'delegated': {
      return {
        entityType: 'task',
        filter: { all: [{ field: 'delegatedByUserId', op: 'eq', value: current }] },
        schemaVersion: 1,
      };
    }
    case 'review': {
      return {
        entityType: 'task',
        filter: { all: [{ field: 'reviewerUserId', op: 'eq', value: current }] },
        schemaVersion: 1,
      };
    }
    case 'subscribed': {
      return {
        entityType: 'task',
        schemaVersion: 1,
      };
    }
    case 'activity': {
      // "Activity" = every task the current user touches — assignee,
      // creator, delegator, reviewer or subscriber. The mode-specific OR
      // lives in taskConditions (delegated/reviewer/subscribed are virtual
      // fields resolved to EXISTS subqueries).
      return {
        entityType: 'task',
        schemaVersion: 1,
        sort: [
          { direction: 'desc', field: 'updatedAt' },
          { direction: 'asc', field: 'id' },
        ],
      };
    }
  }
};

export const hashQuery = (query: WorkQuery) => JSON.stringify(query);

export const applyWorkQueryLayout = (
  query: WorkQuery,
  layout?: WorkQueryLayout,
  groupBy?: WorkQueryGroupBy,
): WorkQuery => {
  const nextLayout = layout ?? query.layout ?? 'list';
  if (nextLayout !== 'board') {
    const nextGroupBy = groupBy ?? query.groupBy;
    if (nextGroupBy === 'none') {
      return { ...query, groupBy: 'none', layout: 'list' };
    }
    return {
      ...query,
      groupBy: nextGroupBy === 'workflowCategory' ? 'workflowCategory' : 'status',
      layout: 'list',
    };
  }
  return {
    ...query,
    groupBy: groupBy ?? query.groupBy ?? 'workflowCategory',
    layout: 'board',
  };
};

export const workQueryBoardGroupBy = (
  query: WorkQuery,
): 'status' | 'workflowCategory' | undefined => {
  if (query.layout === 'board') {
    return query.groupBy === 'status' ? 'status' : 'workflowCategory';
  }
  if (query.groupBy === 'status' || query.groupBy === 'workflowCategory') {
    return query.groupBy;
  }
  return undefined;
};

const boardColumnFor = (groupBy: 'status' | 'workflowCategory') =>
  groupBy === 'status' ? tasks.status : tasks.workflowCategory;

const stableBoardKeys = (groupBy: 'status' | 'workflowCategory'): readonly string[] =>
  groupBy === 'status' ? WORK_QUERY_STATUS_COLUMNS : WORK_QUERY_WORKFLOW_COLUMNS;

/** Keyset for board-ordered groups: position asc, then createdAt/seq desc —
 * the same total order TASK_BOARD_ORDER applies on the task-store board. */
const keysetAfterBoardPosition = (cursor: typeof tasks.$inferSelect): SQL => {
  const curPos = cursor.position ?? -(new Date(cursor.createdAt).getTime() / 1000);
  return or(
    sql`${taskEffectivePosition} > ${curPos}`,
    and(sql`${taskEffectivePosition} = ${curPos}`, lt(tasks.createdAt, cursor.createdAt)),
    and(
      sql`${taskEffectivePosition} = ${curPos}`,
      eq(tasks.createdAt, cursor.createdAt),
      lt(tasks.seq, cursor.seq),
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
  if (next.some((item) => item.field === 'delegatedByUserId' || item.field === 'reviewerUserId')) {
    throw new WorkQueryError('INVALID_QUERY', 'Cannot sort by a virtual field');
  }
  if (next.at(-1)?.field !== 'id') {
    next.push({ direction: 'asc', field: 'id' });
  }
  return next;
};

const sortColumn = (field: WorkQuerySort['field']) => {
  if (field === 'updatedAt') return tasks.updatedAt;
  if (field === 'id') return tasks.id;
  return taskColumn(field);
};

const sortValue = (
  row: typeof tasks.$inferSelect,
  field: WorkQuerySort['field'],
): Date | number | string | null => {
  if (field === 'updatedAt') return row.updatedAt;
  if (field === 'id') return row.id;
  if (field === 'cycleId') return row.cycleRefId;
  if (field === 'delegatedByUserId' || field === 'reviewerUserId') {
    throw new WorkQueryError('INVALID_QUERY', 'Cannot sort by a virtual field');
  }
  return row[field];
};

/** Keyset: (c1, c2, …, id) compared with the cursor row using each column's direction. */
const keysetEq = (field: WorkQuerySort['field'], value: Date | number | string | null): SQL =>
  value == null ? isNull(sortColumn(field)) : eq(sortColumn(field), value as never);

const keysetBeyond = (
  field: WorkQuerySort['field'],
  direction: WorkQuerySort['direction'],
  value: Date | number | string | null,
): SQL | undefined => {
  const column = sortColumn(field);
  if (direction === 'asc') {
    if (value == null) return undefined;
    return or(gt(column, value as never), isNull(column))!;
  }
  if (value == null) return isNotNull(column);
  return lt(column, value as never);
};

const keysetAfter = (sort: WorkQuerySort[], cursor: typeof tasks.$inferSelect): SQL => {
  const parts: SQL[] = [];
  for (let index = 0; index < sort.length; index += 1) {
    const equalities: SQL[] = [];
    for (let prior = 0; prior < index; prior += 1) {
      const field = sort[prior]!.field;
      equalities.push(keysetEq(field, sortValue(cursor, field)));
    }
    const current = sort[index]!;
    const beyond = keysetBeyond(current.field, current.direction, sortValue(cursor, current.field));
    if (!beyond) continue;
    parts.push(equalities.length ? and(...equalities, beyond)! : beyond);
  }
  return parts.length ? or(...parts)! : sql`false`;
};

export class WorkQueryModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  private ownership = () =>
    buildWorkspaceWhere(
      { userId: this.userId, workspaceId: this.workspaceId },
      {
        userId: tasks.createdByUserId,
        visibility: tasks.visibility,
        workspaceId: tasks.workspaceId,
      },
    );

  private listReadableTeamIds = async (): Promise<Set<string>> => {
    if (!this.workspaceId) return new Set();
    const rows = await new TeamModel(this.db, this.userId, this.workspaceId).listReadable();
    return new Set(rows.map((row) => row.id));
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
    const conditions: SQL[] = [this.ownership(), buildTaskTeamReadableWhere(this.db, this.userId)];
    const filterSql = compileFilter(query.filter, this.compileCtx('task', readableTeamIds));
    if (filterSql) conditions.push(filterSql);
    if (mode === 'subscribed') {
      conditions.push(
        sql`exists (select 1 from ${taskSubscriptions} where ${taskSubscriptions.taskId} = ${tasks.id} and ${taskSubscriptions.userId} = ${this.userId} and ${taskSubscriptions.unsubscribedAt} is null)`,
      );
    }
    if (mode === 'activity') {
      conditions.push(
        sql`(
          ${tasks.assigneeUserId} = ${this.userId}
          or ${tasks.createdByUserId} = ${this.userId}
          or ${tasks.reviewerUserId} = ${this.userId}
          or exists (select 1 from ${taskSubscriptions} where ${taskSubscriptions.taskId} = ${tasks.id} and ${taskSubscriptions.userId} = ${this.userId} and ${taskSubscriptions.unsubscribedAt} is null)
          or exists (select 1 from ${executionGrants} where ${executionGrants.taskId} = ${tasks.id} and ${executionGrants.initiatedBy} = ${this.userId} and ${executionGrants.status} = 'active')
          or exists (select 1 from ${actionApprovals} where ${actionApprovals.targetId} = ${tasks.id} and ${actionApprovals.status} = 'pending' and ${actionApprovals.approverUserId} = ${this.userId})
        )`,
      );
    }
    return conditions;
  };

  queryTasks = async (params: {
    afterId?: string;
    groupKey?: string;
    limit?: number;
    mode?: MyWorkMode;
    query: WorkQuery;
    queryHash?: string;
  }) => {
    const query = params.query;
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
      return this.queryTaskBoard({
        afterId: params.afterId,
        conditions,
        groupBy,
        groupKey: params.groupKey,
        layout: query.layout === 'board' ? 'board' : 'list',
        limit,
        queryHash,
        requestedHash: params.queryHash,
        sort,
      });
    }

    const listConditions = [...conditions];

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
      listConditions.push(keysetAfter(sort, cursor));
    }

    const orderBy = sort.map((item) =>
      item.direction === 'desc' ? desc(sortColumn(item.field)) : asc(sortColumn(item.field)),
    );

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(and(...conditions));

    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(...listConditions))
      .orderBy(...orderBy)
      .limit(limit);

    return {
      groupBy: 'none' as const,
      groups: undefined,
      layout: 'list' as const,
      queryHash,
      tasks: rows,
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
    groupBy: 'status' | 'workflowCategory';
    groupKey?: string;
    layout: WorkQueryLayout;
    limit: number;
    queryHash: string;
    requestedHash?: string;
    sort: WorkQuerySort[];
  }) => {
    if (params.afterId && !params.groupKey) {
      throw new WorkQueryError('CURSOR_INVALID', 'CURSOR_INVALID');
    }
    if (params.afterId && (!params.requestedHash || params.requestedHash !== params.queryHash)) {
      throw new WorkQueryError('CURSOR_INVALID', 'CURSOR_INVALID');
    }

    // Raw dimension keys everywhere — no folding into Cordy columns, so an
    // in-review issue never lands in a needs-input run-state bucket.
    const column = boardColumnFor(params.groupBy);
    const matchesKey = (key: string): SQL => eq(column, key as never);
    const countRows = await this.db
      .select({ count: sql<number>`count(*)`, key: column })
      .from(tasks)
      .where(and(...params.conditions))
      .groupBy(column);

    const countByKey = new Map<string, number>();
    for (const row of countRows) {
      countByKey.set(String(row.key), Number(row.count));
    }
    const total = [...countByKey.values()].reduce((sum, count) => sum + count, 0);

    const stable = stableBoardKeys(params.groupBy);
    const extra = [...countByKey.keys()]
      .filter((key) => !(stable as readonly string[]).includes(key))
      .sort();
    const totalsKeys = [...stable, ...extra];

    // Board ordering is manual (position) so a same-column drop persists
    // exactly where the user left it; lists keep the query's own sort.
    const boardOrdered = params.layout === 'board';
    const orderBy = boardOrdered
      ? [sql`${taskEffectivePosition} asc`, desc(tasks.createdAt), desc(tasks.seq)]
      : params.sort.map((item) =>
          item.direction === 'desc' ? desc(sortColumn(item.field)) : asc(sortColumn(item.field)),
        );

    const groups = await Promise.all(
      totalsKeys.map(async (key) => {
        const groupTotal = countByKey.get(key) ?? 0;
        if (params.groupKey && key !== params.groupKey) {
          return { hasMore: groupTotal > 0, key, tasks: [], total: groupTotal };
        }

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
            boardOrdered ? keysetAfterBoardPosition(cursor) : keysetAfter(params.sort, cursor),
          );
        }

        const rows = await this.db
          .select()
          .from(tasks)
          .where(and(...groupConditions))
          .orderBy(...orderBy)
          .limit(params.limit);

        return {
          hasMore: params.afterId ? rows.length === params.limit : rows.length < groupTotal,
          key,
          tasks: rows,
          total: groupTotal,
        };
      }),
    );

    return {
      groupBy: params.groupBy,
      groups,
      layout: params.layout,
      queryHash: params.queryHash,
      tasks: groups.flatMap((group) => group.tasks),
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
    limit?: number;
    query: WorkQuery;
    queryHash?: string;
  }) => {
    validateWorkQuery(params.query);
    if (params.query.entityType !== 'project') {
      throw new WorkQueryError('INVALID_QUERY', 'entityType must be project');
    }
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
    const conditions: SQL[] = [
      buildProjectReadableWhere(this.db, {
        userId: this.userId,
        workspaceId: this.workspaceId,
      }),
    ];

    const readableTeamIds = filterHasTeamId(params.query.filter)
      ? await this.listReadableTeamIds()
      : new Set<string>();
    const filterSql = compileFilter(
      params.query.filter,
      this.compileCtx('project', readableTeamIds),
    );
    if (filterSql) conditions.push(filterSql);

    const queryHash = hashQuery(params.query);
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
      listConditions.push(
        or(
          lt(projects.updatedAt, cursor.updatedAt),
          and(eq(projects.updatedAt, cursor.updatedAt), gt(projects.id, cursor.id)),
        )!,
      );
    }

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(projects)
      .where(and(...conditions));

    const rows = await this.db
      .select()
      .from(projects)
      .where(and(...listConditions))
      .orderBy(desc(projects.updatedAt), asc(projects.id))
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
    const query = params.query;
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
    const query = params.query;
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
            ? tasks.status
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
          buildTaskTeamReadableWhere(this.db, this.userId),
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
}
