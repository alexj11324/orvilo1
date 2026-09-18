import type {
  MyWorkMode,
  WorkQuery,
  WorkQueryEntityType,
  WorkQueryField,
  WorkQueryFilter,
  WorkQueryOp,
  WorkQueryPredicate,
} from '@orvilo/types';
import { WORK_QUERY_MAX_DEPTH, WORK_QUERY_MAX_PREDICATES } from '@orvilo/types';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
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

const hashQuery = (query: WorkQuery) => JSON.stringify(query);

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

  queryTasks = async (params: {
    afterId?: string;
    limit?: number;
    mode?: MyWorkMode;
    query: WorkQuery;
  }) => {
    const query = params.query;
    validateWorkQuery(query);
    if (query.entityType !== 'task') {
      throw new WorkQueryError('INVALID_QUERY', 'This kernel currently runs task queries');
    }

    const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
    const conditions: SQL[] = [this.ownership()];
    const filterSql = compileFilter(query.filter, {
      currentUserId: this.userId,
      entityType: 'task',
    });
    if (filterSql) conditions.push(filterSql);

    if (params.mode === 'subscribed') {
      conditions.push(
        sql`exists (select 1 from ${taskSubscriptions} where ${taskSubscriptions.taskId} = ${tasks.id} and ${taskSubscriptions.userId} = ${this.userId} and ${taskSubscriptions.unsubscribedAt} is null)`,
      );
    }

    const queryHash = hashQuery(query);
    if (params.afterId) {
      // Stable cursor: last sort tuple must include id, bound to this queryHash.
      conditions.push(sql`${tasks.id} < ${params.afterId}`);
    }

    const sort = query.sort?.length
      ? query.sort
      : [
          { direction: 'desc' as const, field: 'updatedAt' as const },
          { direction: 'asc' as const, field: 'id' as const },
        ];

    const orderBy = sort.map((item) => {
      const column =
        item.field === 'updatedAt'
          ? tasks.updatedAt
          : item.field === 'id'
            ? tasks.id
            : taskColumn(item.field as WorkQueryField);
      return item.direction === 'desc' ? desc(column) : asc(column);
    });

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(and(...conditions));

    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(limit);

    return {
      queryHash,
      tasks: rows,
      total: Number(countRow?.count ?? 0),
    };
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
