import type {
  MyWorkMode,
  WorkQuery,
  WorkQueryEntityType,
  WorkQueryExternalReview,
  WorkQueryField,
  WorkQueryFilter,
  WorkQueryGroupBy,
  WorkQueryLayout,
  WorkQueryOp,
  WorkQueryPredicate,
  WorkQuerySort,
} from '@orvilo/types';
import {
  WORK_QUERY_MAX_DEPTH,
  WORK_QUERY_MAX_PREDICATES,
  WORK_QUERY_STATUS_COLUMNS,
  WORK_QUERY_WORKFLOW_COLUMNS,
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
import { buildWorkspaceWhere } from '../utils/workspace';

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
      if (!Array.isArray(resolved) || resolved.length === 0) {
        throw new WorkQueryError('INVALID_QUERY', 'in requires a non-empty array');
      }
      return inArray(column, resolved as never[]);
    }
    case 'notIn': {
      if (!Array.isArray(resolved) || resolved.length === 0) {
        throw new WorkQueryError('INVALID_QUERY', 'notIn requires a non-empty array');
      }
      return notInArray(column, resolved as never[]);
    }
    default: {
      throw new WorkQueryError('INVALID_QUERY', `Unknown operator: ${String(op)}`);
    }
  }
};

const compilePredicate = (
  predicate: WorkQueryPredicate,
  ctx: { currentUserId: string; entityType: WorkQueryEntityType },
): SQL => {
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
        return sql`exists (select 1 from ${projectTeams} where ${projectTeams.projectId} = ${projects.id})`;
      }
      if (predicate.op !== 'eq' || typeof resolved !== 'string') {
        throw new WorkQueryError('INVALID_QUERY', 'project teamId only supports eq / null checks');
      }
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
    const resolved = resolveValue(predicate.value, ctx.currentUserId);
    if (predicate.op !== 'eq' || typeof resolved !== 'string') {
      throw new WorkQueryError('INVALID_QUERY', 'reviewerUserId only supports eq currentUser');
    }
    return or(
      eq(tasks.reviewerUserId, resolved),
      sql`exists (select 1 from ${actionApprovals} where ${actionApprovals.targetId} = ${tasks.id} and ${actionApprovals.status} = 'pending' and ${actionApprovals.approverUserId} = ${resolved})`,
    )!;
  }

  const op: WorkQueryOp = predicate.op;
  const resolved = resolveValue(predicate.value, ctx.currentUserId);
  return compileColumnPredicate(taskColumn(predicate.field), op, resolved);
};

const compileFilter = (
  node: WorkQueryFilter | undefined,
  ctx: { currentUserId: string; entityType: WorkQueryEntityType },
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
    if (!layout && !groupBy && query.layout !== 'board') return query;
    return {
      ...query,
      ...(groupBy ? { groupBy } : {}),
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
  if (query.layout !== 'board') return undefined;
  return query.groupBy === 'status' ? 'status' : 'workflowCategory';
};

const boardColumnFor = (groupBy: 'status' | 'workflowCategory') =>
  groupBy === 'status' ? tasks.status : tasks.workflowCategory;

const stableBoardKeys = (groupBy: 'status' | 'workflowCategory'): readonly string[] =>
  groupBy === 'status' ? WORK_QUERY_STATUS_COLUMNS : WORK_QUERY_WORKFLOW_COLUMNS;

const externalReviewTitle = (summary: unknown, actionType: string) => {
  if (summary && typeof summary === 'object' && 'title' in summary) {
    const title = (summary as { title?: unknown }).title;
    if (typeof title === 'string' && title.trim()) return title;
  }
  return actionType;
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
const keysetAfter = (sort: WorkQuerySort[], cursor: typeof tasks.$inferSelect): SQL => {
  const parts: SQL[] = [];
  for (let index = 0; index < sort.length; index += 1) {
    const equalities: SQL[] = [];
    for (let prior = 0; prior < index; prior += 1) {
      const field = sort[prior]!.field;
      equalities.push(eq(sortColumn(field), sortValue(cursor, field) as never));
    }
    const current = sort[index]!;
    const column = sortColumn(current.field);
    const value = sortValue(cursor, current.field);
    const cmp =
      current.direction === 'desc' ? lt(column, value as never) : gt(column, value as never);
    parts.push(equalities.length ? and(...equalities, cmp)! : cmp);
  }
  return or(...parts)!;
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

  private taskConditions = (query: WorkQuery, mode?: MyWorkMode) => {
    const conditions: SQL[] = [this.ownership()];
    const filterSql = compileFilter(query.filter, {
      currentUserId: this.userId,
      entityType: 'task',
    });
    if (filterSql) conditions.push(filterSql);
    if (mode === 'subscribed') {
      conditions.push(
        sql`exists (select 1 from ${taskSubscriptions} where ${taskSubscriptions.taskId} = ${tasks.id} and ${taskSubscriptions.userId} = ${this.userId} and ${taskSubscriptions.unsubscribedAt} is null)`,
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
    const conditions = this.taskConditions(query, params.mode);
    const queryHash = hashQuery(query);
    const sort = normalizeTaskSort(query.sort);
    const groupBy = workQueryBoardGroupBy(query);

    if (groupBy) {
      return this.queryTaskBoard({
        afterId: params.afterId,
        conditions,
        groupBy,
        groupKey: params.groupKey,
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

    const column = boardColumnFor(params.groupBy);
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

    const orderBy = params.sort.map((item) =>
      item.direction === 'desc' ? desc(sortColumn(item.field)) : asc(sortColumn(item.field)),
    );

    const groups = await Promise.all(
      totalsKeys.map(async (key) => {
        const groupTotal = countByKey.get(key) ?? 0;
        if (params.groupKey && key !== params.groupKey) {
          return { hasMore: groupTotal > 0, key, tasks: [], total: groupTotal };
        }

        const groupConditions: SQL[] = [...params.conditions, eq(column, key as never)];
        if (params.afterId) {
          const [cursor] = await this.db
            .select()
            .from(tasks)
            .where(and(...groupConditions, eq(tasks.id, params.afterId)))
            .limit(1);
          if (!cursor) {
            throw new WorkQueryError('CURSOR_INVALID', 'CURSOR_INVALID');
          }
          groupConditions.push(keysetAfter(params.sort, cursor));
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
      layout: 'board' as const,
      queryHash: params.queryHash,
      tasks: groups.flatMap((group) => group.tasks),
      total,
    };
  };

  /**
   * Readable pending reviews that are not Tasks. Never inserts a Task row.
   */
  queryExternalReviews = async (): Promise<WorkQueryExternalReview[]> => {
    if (!this.workspaceId) return [];
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
          eq(actionApprovals.approverUserId, this.userId),
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
          targetId: row.targetId,
          targetType: row.targetType,
          title: externalReviewTitle(row.actionSummary, row.actionType),
        },
      ];
    });
  };

  queryProjects = async (params: { limit?: number; query: WorkQuery }) => {
    validateWorkQuery(params.query);
    if (params.query.entityType !== 'project') {
      throw new WorkQueryError('INVALID_QUERY', 'entityType must be project');
    }
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
    const conditions: SQL[] = [];
    if (this.workspaceId) conditions.push(eq(projects.workspaceId, this.workspaceId));
    else conditions.push(eq(projects.userId, this.userId), isNull(projects.workspaceId));

    const filterSql = compileFilter(params.query.filter, {
      currentUserId: this.userId,
      entityType: 'project',
    });
    if (filterSql) conditions.push(filterSql);

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(projects)
      .where(and(...conditions));

    const rows = await this.db
      .select()
      .from(projects)
      .where(and(...conditions))
      .orderBy(desc(projects.updatedAt), asc(projects.id))
      .limit(limit);
    return {
      projects: rows,
      queryHash: hashQuery(params.query),
      total: Number(countRow?.count ?? 0),
    };
  };
}
