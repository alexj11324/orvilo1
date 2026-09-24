import type {
  CheckpointConfig,
  LinearExternalCommentOutboxPayload,
  LinearExternalRelationOutboxPayload,
  NewTask,
  TaskActivityLogPayload,
  TaskActivityLogType,
  TaskAutomationMode,
  TaskAutomationSnapshot,
  TaskDomainEventSource,
  TaskDomainEventType,
  TaskItem,
  TaskMoveScope,
  TaskSubtaskProgress,
  TaskVerifyConfig,
  TaskWorkflowCategory,
  WorkspaceData,
  WorkspaceDocNode,
  WorkspaceTreeNode,
} from '@orvilo/types';
import {
  and,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  notExists,
  notInArray,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { merge } from '@/utils/merge';

import { agentOperations } from '../schemas/agentOperations';
import { executionGrants } from '../schemas/executionGrant';
import { documents } from '../schemas/file';
import type {
  NewTaskActivity,
  NewTaskComment,
  TaskActivityItem,
  TaskCommentItem,
} from '../schemas/task';
import {
  taskActivities,
  taskComments,
  taskDependencies,
  taskDocuments,
  tasks,
  taskTopics,
} from '../schemas/task';
import { teams } from '../schemas/team';
import { topics } from '../schemas/topic';
import { acceptances } from '../schemas/verify';
import { works } from '../schemas/work';
import type { OrviloDatabase } from '../type';
import { buildTaskTeamReadableWhere } from '../utils/taskTeamReadable';
import { buildWorkspaceWhere } from '../utils/workspace';
import { LinearSyncModel } from './linearSync';
import { TaskDependencyError } from './taskDependency';

/** Columns whose change is worth a line in the task activity feed. */
const TRACKED_TASK_COLUMNS = [
  'assigneeAgentId',
  'assigneeUserId',
  'automationMode',
  // Only for `schedule.maxExecutions`, which lives in the JSONB pocket; the
  // rest of `config` is not diffed.
  'config',
  'heartbeatInterval',
  'priority',
  'reviewerUserId',
  'schedulePattern',
  'scheduleTimezone',
  'status',
  'triageStatus',
] as const satisfies readonly (keyof NewTask)[];

/** Task fields that must wake a linked Linear issue even without an activity row. */
const LINEAR_SYNC_TASK_COLUMNS = [
  'description',
  'editorData',
  'instruction',
  'name',
  'parentTaskId',
  'priority',
  'projectId',
] as const;

/**
 * Columns that describe the task as a business object. Runtime bookkeeping
 * such as heartbeat timestamps, topic counters and scheduler context is
 * deliberately absent: those writes must not invalidate a planner read-set.
 */
const TASK_DOMAIN_COLUMNS = [
  'assigneeAgentId',
  'assigneeLocked',
  'assigneeUserId',
  'assignmentMode',
  'automationMode',
  'config',
  'cycleRefId',
  'description',
  'duplicateOfTaskId',
  'editorData',
  'heartbeatInterval',
  'heartbeatTimeout',
  'instruction',
  'lockMetadata',
  'maxTopics',
  'name',
  'orchestrationOwner',
  'parentTaskId',
  'priority',
  'priorityLocked',
  'projectId',
  'requirementLocked',
  'reviewerUserId',
  'schedulePattern',
  'scheduleTimezone',
  'sortOrder',
  'status',
  'teamId',
  'triageStatus',
  'visibility',
  'workflowCategory',
  'workflowLocked',
  'workflowStateId',
  'workflowStateRefId',
] as const satisfies readonly (keyof NewTask)[];

const TASK_REQUIREMENT_COLUMNS = [
  'description',
  'editorData',
  'instruction',
  'name',
  'parentTaskId',
  'projectId',
] as const satisfies readonly (keyof NewTask)[];

const TASK_POLICY_COLUMNS = [
  'assigneeLocked',
  'assignmentMode',
  'automationMode',
  'config',
  'heartbeatInterval',
  'heartbeatTimeout',
  'lockMetadata',
  'maxTopics',
  'orchestrationOwner',
  'priorityLocked',
  'requirementLocked',
  'schedulePattern',
  'scheduleTimezone',
  'workflowLocked',
] as const satisfies readonly (keyof NewTask)[];

export interface TaskMutationContext {
  /** External event/delivery id carried into planner diagnostics. */
  eventId?: string;
  /**
   * When set, `moveToTeam` only writes if `domainRevision` still matches.
   * Inbound Linear sync omits this; the Team UI must send it.
   */
  expectedDomainRevision?: number;
  /** Stable caller key when the write is a replayable command or delivery. */
  idempotencyKey?: string;
  source?: TaskDomainEventSource;
  /** Bulk/bootstrap paths may publish one scope fact after all row writes commit. */
  suppressDomainEvent?: boolean;
  /** Prevent a provider-originated reconciliation from echoing back out. */
  suppressLinearOutbox?: boolean;
}

export class TaskRevisionConflictError extends Error {
  readonly code = 'TASK_REVISION_CONFLICT' as const;

  constructor() {
    super('TASK_REVISION_CONFLICT');
    this.name = 'TaskRevisionConflictError';
  }
}

const relationKey = (
  kind: 'blocks' | 'parent' | 'relates',
  sourceTaskId: string,
  targetTaskId?: string | null,
) =>
  kind === 'parent'
    ? `parent:${sourceTaskId}`
    : kind === 'relates'
      ? `relates:${[sourceTaskId, targetTaskId ?? ''].sort().join(':')}`
      : `blocks:${sourceTaskId}:${targetTaskId ?? ''}`;

const touchedColumns = <T extends readonly (keyof NewTask)[]>(data: Partial<NewTask>, columns: T) =>
  columns.filter((column) => data[column] !== undefined);

const taskMutationEventType = (data: Partial<NewTask>): TaskDomainEventType | undefined => {
  if (data.teamId !== undefined) {
    return 'task.moved';
  }
  if (data.assigneeAgentId !== undefined || data.assigneeUserId !== undefined) {
    return 'task.assigned';
  }
  if (
    data.status !== undefined ||
    data.workflowCategory !== undefined ||
    data.workflowStateId !== undefined
  ) {
    return 'task.status.changed';
  }
  if (touchedColumns(data, TASK_REQUIREMENT_COLUMNS).length > 0) {
    return 'task.requirement.changed';
  }
  // Admit / decline / duplicate must wake planning once without looking like a
  // requirement edit that auto-apply can treat as new executable work.
  if (data.triageStatus !== undefined || data.duplicateOfTaskId !== undefined) {
    return 'task.scope.changed';
  }
  return touchedColumns(data, TASK_DOMAIN_COLUMNS).length > 0
    ? 'task.requirement.changed'
    : undefined;
};

/** The automation columns folded into one value — see `TaskAutomationSnapshot`. */
/**
 * The actor columns plus the payload tombstone for one activity row. An
 * agent-driven edit is attributed to the agent, not to the session owner
 * whose credentials it borrowed. Both ids null means the system did it on
 * nobody's behalf (the runner's inbox fallback). `actorKind` repeats that in
 * the payload because the id columns are cleared when the actor is deleted,
 * and "someone who is gone" must not read as "the system".
 */
export const taskActivityActor = (actor: {
  agentId?: string | null;
  userId?: string | null;
}): {
  actorAgentId: string | null;
  actorKind: 'agent' | 'system' | 'user';
  actorUserId: string | null;
} => ({
  actorAgentId: actor.agentId ?? null,
  actorKind: actor.agentId ? 'agent' : actor.userId ? 'user' : 'system',
  actorUserId: actor.agentId ? null : (actor.userId ?? null),
});

const snapshotAutomation = (row: {
  automationMode: TaskAutomationMode | null;
  config: unknown;
  heartbeatInterval: number | null;
  schedulePattern: string | null;
  scheduleTimezone: string | null;
}): TaskAutomationSnapshot | null => {
  // No mode means automation is off; the leftover pattern / interval columns
  // are configuration in waiting, not something the user turned on.
  if (!row.automationMode) return null;
  const maxExecutions = (row.config as { schedule?: { maxExecutions?: number | null } } | null)
    ?.schedule?.maxExecutions;
  return {
    heartbeatInterval: row.heartbeatInterval,
    maxExecutions: typeof maxExecutions === 'number' ? maxExecutions : null,
    mode: row.automationMode,
    schedulePattern: row.schedulePattern,
    scheduleTimezone: row.scheduleTimezone,
  };
};

export const isTaskIdentifierUniqueViolation = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
  const cause = error instanceof Error ? error.cause : undefined;

  return (
    code === '23505' ||
    message.includes('23505') ||
    message.includes('duplicate') ||
    message.includes('unique') ||
    (!!cause && isTaskIdentifierUniqueViolation(cause))
  );
};

/**
 * Ownership helpers in this model come in three flavors. Choose by USE CASE,
 * not by table — picking the wrong one led to a `seq` allocation hotfix
 * (see git log).
 *
 * ┌────────────────────┬──────────────────────────────────────────────┬────────────────────────┐
 * │ Helper             │ Use for                                      │ Visibility-aware?      │
 * ├────────────────────┼──────────────────────────────────────────────┼────────────────────────┤
 * │ ownership()        │ list / read / per-row find on `tasks`        │ YES — public OR owner, │
 * │                    │                                              │ AND private-team ACL   │
 * │ ownershipSql()     │ raw-SQL CTEs that need the same predicate    │ YES — public OR owner  │
 * │                    │ (subtree walks from a readable root; keep    │                        │
 * │                    │ workspace visibility so an assignee can see  │                        │
 * │                    │ their descendants without team membership)   │                        │
 * │ childOwnership()   │ task_dependencies / task_documents /         │ YES when caller passes │
 * │                    │ task_comments etc. (per-child-table)         │ the visibility column  │
 * │ seqOwnership()     │ identifier / seq allocation on `tasks`       │ NO — workspace-wide    │
 * │                    │ (the `(workspace_id, identifier)` unique     │ (visibility filter     │
 * │                    │ constraint is workspace-wide, regardless     │ would skip other       │
 * │                    │ of visibility)                               │ members' rows and      │
 * │                    │                                              │ collide on insert)     │
 * └────────────────────┴──────────────────────────────────────────────┴────────────────────────┘
 *
 * Personal mode (no workspace) is always `created_by_user_id = $self AND
 * workspace_id IS NULL` for all four helpers — visibility is inert because
 * everything personal is implicitly owner-only.
 */
/**
 * A task the automation runtime would still act on.
 *
 * `automation_mode` alone does not mean "this fires". The tick services refuse
 * to run on exactly these grounds — `scheduleTick` skips a schedule with no
 * cron pattern, `heartbeatTick` skips a heartbeat with no positive interval,
 * and both skip a task that has reached a terminal status. A row that keeps its
 * mode after being completed, canceled or stripped of its pattern is a
 * leftover, not a schedule, and listing it as one lets dead entries crowd real
 * ones out of a bounded roll-up.
 *
 * Kept as one expression so the `automated` filter's two sides stay exact
 * complements and no row falls into neither bucket.
 */
const RUNNABLE_AUTOMATION = and(
  notInArray(tasks.status, ['canceled', 'completed', 'failed']),
  or(
    and(
      eq(tasks.automationMode, 'schedule'),
      isNotNull(tasks.schedulePattern),
      ne(tasks.schedulePattern, ''),
    ),
    and(eq(tasks.automationMode, 'heartbeat'), gt(tasks.heartbeatInterval, 0)),
  ),
)!;

/**
 * Kanban ordering key for grouped reads. Rows that were never dragged carry
 * `position = NULL` and fall back to `-epoch(created_at)`, preserving the
 * legacy newest-first order while letting a dropped card hold an explicit
 * slot between its neighbours. `createdAt`/`seq` tiebreaks keep the order
 * total when two rows share one key.
 */
export const taskEffectivePosition = sql`coalesce(${tasks.position}, -extract(epoch from ${tasks.createdAt}))`;
const TASK_BOARD_ORDER = [
  sql`${taskEffectivePosition} asc`,
  desc(tasks.createdAt),
  desc(tasks.seq),
];
/**
 * Fixed stride a collapsed kanban column is respaced to. Small magnitudes
 * (multiples of 1024) keep midpoint halving inside double precision for far
 * longer than the legacy `-epoch(created_at)` fallback scale ever could.
 */
const MOVE_REBALANCE_STEP = 1024;

interface TaskListFilterOptions {
  assigneeAgentId?: string;
  /** Only tasks assigned to this workspace member. */
  assigneeUserId?: string;
  automated?: boolean;
  /** Only tasks created by this user. */
  createdByUserId?: string;
  /**
   * Only tasks with an active execution grant this user initiated — the
   * "delegated to agents by me" slice. Mirrors the workQuery
   * `delegatedByUserId` predicate.
   */
  delegatedByUserId?: string;
  parentTaskId?: string | null;
  /** `null` narrows to tasks with no project — the board's "No project" chip. */
  projectId?: string | null;
  visibility?: 'private' | 'public';
}

interface TaskListOptions extends TaskListFilterOptions {
  /**
   * Keyset cursor: only rows that sort strictly after this `(orderBy, seq)`
   * position in the list's newest-first order. Unlike `offset`, a cursor is
   * unaffected by rows inserted or deleted ahead of it, so a client walking
   * the whole list page by page never repeats or skips a row.
   */
  after?: { at: Date; seq: number };
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'updatedAt';
  priorities?: number[];
  statuses?: string[];
}

interface TaskRunStats extends Record<string, unknown> {
  root_id: string;
  total_run_cost: number;
  total_run_duration: number;
}

interface TaskSubtaskProgressRow extends Record<string, unknown> {
  completed: number;
  root_id: string;
  total: number;
}

export class TaskModel {
  private readonly userId: string;
  private readonly db: OrviloDatabase;
  private readonly workspaceId?: string;
  private readonly managedSubject: boolean;

  constructor(
    db: OrviloDatabase,
    userId: string,
    workspaceId?: string,
    options: { managedSubject?: boolean } = {},
  ) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
    this.managedSubject = options.managedSubject ?? false;
  }

  /**
   * Compat-mode ownership predicate for the `tasks` table — **visibility-aware**
   * and **team-readable**. `tasks` uses `createdByUserId` instead of `userId`.
   * Workspace mode applies visibility-aware filtering: public tasks are
   * visible to every member, private tasks only to their creator. Private-team
   * tasks additionally require team membership, workspace admin/owner, or a
   * personal assignee/reviewer/creator exception (TRI05 / SEC06). Use this for
   * every list/read path. For identifier / seq allocation, use `seqOwnership`
   * instead — that helper stays workspace-wide and must not AND team ACL.
   */
  private ownership = () => {
    const workspaceVisible = buildWorkspaceWhere(
      { userId: this.userId, workspaceId: this.workspaceId },
      {
        userId: tasks.createdByUserId,
        visibility: tasks.visibility,
        workspaceId: tasks.workspaceId,
      },
    );
    if (!this.workspaceId) return workspaceVisible;
    return and(workspaceVisible, buildTaskTeamReadableWhere(this.db, this.userId))!;
  };

  /**
   * Ownership predicate for task child tables (deps / docs / comments) that
   * use a `userId` column instead of `createdByUserId`. Pass `visibility` for
   * tables that mirror the parent task's visibility column; leave it omitted
   * for tables that stay workspace-shared (e.g. comments).
   */
  private childOwnership = (cols: {
    userId: AnyPgColumn;
    visibility?: AnyPgColumn;
    workspaceId: AnyPgColumn;
  }) => buildWorkspaceWhere({ userId: this.userId, workspaceId: this.workspaceId }, cols);

  /**
   * Workspace-wide ownership for `tasks.seq` / `identifier` allocation —
   * must NOT be visibility-filtered. The `(workspace_id, identifier)` unique
   * constraint is workspace-scoped regardless of visibility, so seq lookups
   * have to see every row in the workspace; otherwise creators of private
   * tasks can collide on identifiers belonging to other members' rows.
   */
  private seqOwnership = () =>
    this.workspaceId
      ? eq(tasks.workspaceId, this.workspaceId)
      : (and(eq(tasks.createdByUserId, this.userId), isNull(tasks.workspaceId)) as SQL);

  /**
   * Raw-SQL ownership clause for use inside `db.execute(sql...)` CTEs that
   * can't easily compose with drizzle's `and(...)` helpers. Mirrors
   * `buildWorkspaceWhere` semantics:
   *   - workspace mode → `(workspace_id = $ws AND (visibility = 'public' OR created_by_user_id = $userId))
   *                       OR (workspace_id IS NULL AND created_by_user_id = $userId)`
   *     — the caller's own unfiled rows follow them into the workspace view,
   *     matching `ownership()` so dependency edges stay visible on rows the
   *     task read itself admits.
   *   - personal mode  → `created_by_user_id = $userId AND workspace_id IS NULL`
   */
  private ownershipSql = (alias?: string) => {
    const prefix = alias ? sql.raw(`${alias}.`) : sql.raw('');
    return this.workspaceId
      ? sql`((${prefix}workspace_id = ${this.workspaceId}
            AND (${prefix}visibility = 'public' OR ${prefix}created_by_user_id = ${this.userId}))
           OR (${prefix}workspace_id IS NULL AND ${prefix}created_by_user_id = ${this.userId}))`
      : sql`${prefix}created_by_user_id = ${this.userId} AND ${prefix}workspace_id IS NULL`;
  };

  private buildListConditions = ({
    assigneeAgentId,
    assigneeUserId,
    automated,
    createdByUserId,
    delegatedByUserId,
    parentTaskId,
    projectId,
    visibility,
  }: TaskListFilterOptions): SQL[] => {
    const conditions = [this.ownership()];

    if (assigneeAgentId) conditions.push(eq(tasks.assigneeAgentId, assigneeAgentId));
    if (assigneeUserId) conditions.push(eq(tasks.assigneeUserId, assigneeUserId));
    if (createdByUserId) conditions.push(eq(tasks.createdByUserId, createdByUserId));
    if (delegatedByUserId) {
      conditions.push(
        sql`exists (select 1 from ${executionGrants} where ${executionGrants.taskId} = ${tasks.id} and ${executionGrants.initiatedBy} = ${delegatedByUserId} and ${executionGrants.status} = 'active')`,
      );
    }
    if (automated === true) conditions.push(RUNNABLE_AUTOMATION);
    // `IS NOT TRUE`, not `NOT (…)`: nullable automation fields make the
    // runnable expression NULL for manual tasks, and WHERE would drop them.
    if (automated === false) conditions.push(sql`${RUNNABLE_AUTOMATION} IS NOT TRUE`);
    if (projectId === null) {
      conditions.push(isNull(tasks.projectId));
    } else if (projectId) {
      conditions.push(eq(tasks.projectId, projectId));
    }
    if (visibility) conditions.push(eq(tasks.visibility, visibility));

    if (parentTaskId === null) {
      conditions.push(isNull(tasks.parentTaskId));
    } else if (parentTaskId) {
      conditions.push(eq(tasks.parentTaskId, parentTaskId));
    }

    return conditions;
  };

  /**
   * Look up a task's visibility so child-row inserts (deps, docs, topics) can
   * mirror it without forcing every call site to know the value. Defaults to
   * `'public'` if the task is missing (keeps inserts idempotent — the
   * onConflictDoNothing path stays valid).
   */
  private async getTaskVisibility(taskId: string): Promise<'private' | 'public'> {
    const row = await this.db
      .select({ visibility: tasks.visibility })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), this.ownership()))
      .limit(1);
    return row[0]?.visibility ?? 'public';
  }

  /** Only transaction-scoped models may hold this flag. Never set it on a shared model. */
  private dependencyLockHeld = false;

  /**
   * Graph edits and status writes share one short transaction lock per workspace
   * (or personal owner). This serializes cycle checks and closes add-vs-start
   * races. Acquire it BEFORE task row locks to keep lock ordering consistent.
   */
  private async lockDependencyGraph(): Promise<void> {
    const scope = this.workspaceId ? `workspace:${this.workspaceId}` : `user:${this.userId}`;
    await this.db.execute(
      sql`select pg_advisory_xact_lock(hashtext('task-prerequisites'), hashtext(${scope}))`,
    );
  }

  private async withDependencyLock<T>(work: (model: TaskModel) => Promise<T>): Promise<T> {
    if (this.dependencyLockHeld) return work(this);
    return this.db.transaction(async (tx) => {
      const model = new TaskModel(tx as OrviloDatabase, this.userId, this.workspaceId);
      await model.lockDependencyGraph();
      model.dependencyLockHeld = true;
      return work(model);
    });
  }

  /** Guard every advancing writer; cancellation/pause remain available for recovery. */
  private async assertDependenciesForStatus(ids: string[], status?: string): Promise<void> {
    if (status !== 'running' && status !== 'completed') return;
    const blocked = await this.findBlockedTaskIds(ids);
    if (blocked.length > 0) {
      throw new TaskDependencyError(
        'Complete all prerequisite tasks before starting or completing this task.',
        'PRECONDITION_FAILED',
      );
    }
  }

  // ========== CRUD ==========

  async create(
    data: Omit<NewTask, 'id' | 'identifier' | 'seq' | 'createdByUserId'> & {
      identifierPrefix?: string;
    },
    options: {
      creationSubject?: {
        id?: string;
        kind: 'integration' | 'system';
        snapshot?: NewTask['createdBySnapshot'];
      };
      maxRetries?: number;
      mutation?: TaskMutationContext;
    } = {},
  ): Promise<TaskItem> {
    const { identifierPrefix = 'T', ...rest } = data;

    const createInDatabase = async (runner: OrviloDatabase): Promise<TaskItem> => {
      // Seq is allocated per ownership scope: workspace-wide in team mode,
      // user-private in personal mode. This keeps `T-N` identifiers stable
      // within the surface the user actually sees.
      //
      // Note: this uses `seqOwnership` (visibility-blind), NOT the regular
      // `ownership()`, because the `(workspace_id, identifier)` unique
      // constraint is workspace-wide and ignores visibility. If we let the
      // seq lookup filter out private rows, a private creator would compute
      // a max seq that skips another member's existing identifier and hit
      // PG error 23505 on insert.
      let nextSeq: number;
      let identifier: string;
      if (rest.teamId && this.workspaceId) {
        // Team-owned issue: allocate `<teamKey>-<n>` through the transactional
        // `teams.next_issue_seq` counter — never `max(seq)+1` across rows.
        // Seed the counter from pre-existing workspace identifiers while the
        // team row is locked. A team can be introduced after imported/project
        // tasks already use the same key prefix.
        const [team] = await runner
          .select({ key: teams.key, nextIssueSeq: teams.nextIssueSeq })
          .from(teams)
          .where(and(eq(teams.id, rest.teamId), eq(teams.workspaceId, this.workspaceId)))
          .for('update')
          .limit(1);
        if (!team) throw new Error(`Team not found: ${rest.teamId}`);
        const [existingPrefix] = await runner
          .select({ maxSeq: sql<number>`COALESCE(MAX(${tasks.seq}), 0)` })
          .from(tasks)
          .where(
            and(
              eq(tasks.workspaceId, this.workspaceId),
              sql`${tasks.identifier} LIKE ${`${team.key}-%`}`,
            ),
          );
        const firstAvailableSeq = Math.max(
          Number(team.nextIssueSeq),
          Number(existingPrefix.maxSeq) + 1,
        );
        const [allocated] = await runner
          .update(teams)
          .set({ nextIssueSeq: firstAvailableSeq + 1 })
          .where(and(eq(teams.id, rest.teamId), eq(teams.workspaceId, this.workspaceId)))
          .returning({ key: teams.key, seq: teams.nextIssueSeq });
        if (!allocated) throw new Error(`Team not found: ${rest.teamId}`);
        nextSeq = Number(allocated.seq) - 1;
        identifier = `${allocated.key}-${nextSeq}`;
      } else {
        const seqResult = await runner
          .select({ maxSeq: sql<number>`COALESCE(MAX(${tasks.seq}), 0)` })
          .from(tasks)
          .where(this.seqOwnership());

        nextSeq = Number(seqResult[0].maxSeq) + 1;
        identifier = `${identifierPrefix}-${nextSeq}`;
      }

      const [task] = await runner
        .insert(tasks)
        .values({
          ...rest,
          createdBySnapshot: options.creationSubject?.snapshot ?? {
            kind: data.createdByAgentId ? 'agent' : 'user',
          },
          createdBySubjectId: options.creationSubject?.id ?? data.createdByAgentId ?? this.userId,
          createdBySubjectKind:
            options.creationSubject?.kind ?? (data.createdByAgentId ? 'agent' : 'user'),
          createdByUserId: options.creationSubject ? null : this.userId,
          identifier,
          seq: nextSeq,
          triageStatus: rest.triageStatus ?? (rest.teamId ? 'untriaged' : rest.triageStatus),
          workspaceId: this.workspaceId ?? null,
        } as NewTask)
        .returning();

      if (this.workspaceId && !options.mutation?.suppressDomainEvent) {
        await new LinearSyncModel(runner, this.workspaceId).recordTaskChangeInTransaction(runner, {
          changedFields: ['created'],
          eventId: options.mutation?.eventId,
          eventType: 'task.created',
          idempotencyKey:
            options.mutation?.idempotencyKey ?? `task:${task.id}:revision:${task.domainRevision}`,
          source:
            options.mutation?.source ??
            (data.createdByAgentId ? 'agent' : options.creationSubject ? 'system' : 'user'),
          suppressLinearOutbox: options.mutation?.suppressLinearOutbox,
          task,
        });
      }

      return task;
    };

    // Retry loop to handle concurrent creates (parallel tool calls)
    const maxRetries = options.maxRetries ?? 5;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return this.workspaceId
          ? await this.db.transaction((tx) => createInDatabase(tx as OrviloDatabase))
          : await createInDatabase(this.db);
      } catch (error: any) {
        // Retry on unique constraint violation (concurrent seq conflict)
        // Check error itself, cause, and stringified message for PG error code 23505
        if (isTaskIdentifierUniqueViolation(error) && attempt < maxRetries - 1) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('Failed to create task after max retries');
  }

  async findById(id: string): Promise<TaskItem | null> {
    const result = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), this.ownership()))
      .limit(1);

    return result[0] || null;
  }

  async findByIds(ids: string[]): Promise<TaskItem[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(tasks)
      .where(and(inArray(tasks.id, ids), this.ownership()));
  }

  async resolveMany(idsOrIdentifiers: string[]): Promise<TaskItem[]> {
    if (idsOrIdentifiers.length === 0) return [];
    const identifiers = idsOrIdentifiers.map((value) => value.toUpperCase());
    return this.db
      .select()
      .from(tasks)
      .where(
        and(
          or(inArray(tasks.id, idsOrIdentifiers), inArray(tasks.identifier, identifiers)),
          this.ownership(),
        ),
      );
  }

  // Resolve id or identifier (e.g. 'T-1') to a task
  async resolve(idOrIdentifier: string): Promise<TaskItem | null> {
    if (idOrIdentifier.startsWith('task_')) return this.findById(idOrIdentifier);
    return this.findByIdentifier(idOrIdentifier.toUpperCase());
  }

  async findByIdentifier(identifier: string): Promise<TaskItem | null> {
    const result = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.identifier, identifier), this.ownership()))
      // Filed rows resolve ahead of unfiled duplicates sharing an identifier.
      .orderBy(sql`${tasks.workspaceId} asc nulls last`)
      .limit(1);

    return result[0] || null;
  }

  /**
   * Reviewer backfill for the 'paused' ("pending review") transition: the
   * human accountable at review is the member assignee when there is one,
   * otherwise the creator. COALESCE keeps an explicitly chosen reviewer
   * (either a non-null `reviewer_user_id` already on the row, or a caller-
   * supplied `data.reviewerUserId`) instead of overwriting it.
   */
  private static reviewerBackfillSet(status: string | undefined, explicit?: string | null) {
    if (status !== 'paused' || explicit !== undefined) return {};
    return {
      reviewerUserId: sql<string | null>`coalesce(
        ${tasks.reviewerUserId},
        ${tasks.assigneeUserId},
        ${tasks.createdByUserId}
      )`,
    };
  }

  async update(
    id: string,
    data: Partial<Omit<NewTask, 'id' | 'identifier' | 'seq' | 'createdByUserId'>>,
    mutation: TaskMutationContext = {},
  ): Promise<TaskItem | null> {
    if (Object.keys(data).length === 0) return this.findById(id);
    if (
      !this.dependencyLockHeld &&
      (data.status !== undefined ||
        data.deletedAt !== undefined ||
        data.isDeleted !== undefined ||
        data.projectId !== undefined ||
        data.visibility !== undefined)
    ) {
      return this.withDependencyLock((model) => model.update(id, data, mutation));
    }
    await this.assertDependenciesForStatus([id], data.status);

    const eventType = taskMutationEventType(data);
    const updateWhere = [eq(tasks.id, id), this.ownership()];
    if (mutation.expectedDomainRevision !== undefined) {
      updateWhere.push(eq(tasks.domainRevision, mutation.expectedDomainRevision));
    }

    const resolveUpdate = async (
      runner: OrviloDatabase,
      updated: TaskItem | undefined,
    ): Promise<TaskItem | null> => {
      if (updated) return updated;
      if (mutation.expectedDomainRevision !== undefined) {
        const [current] = await runner
          .select({ id: tasks.id })
          .from(tasks)
          .where(and(eq(tasks.id, id), this.ownership()))
          .limit(1);
        if (current) throw new TaskRevisionConflictError();
      }
      return null;
    };

    if (!eventType) {
      const updated = await this.db
        .update(tasks)
        .set({
          ...data,
          ...TaskModel.reviewerBackfillSet(data.status, data.reviewerUserId),
          updatedAt: new Date(),
        })
        .where(and(...updateWhere))
        .returning();
      return resolveUpdate(this.db, updated[0]);
    }

    const changedFields = touchedColumns(data, TASK_DOMAIN_COLUMNS).map(String);
    const changesRequirement = touchedColumns(data, TASK_REQUIREMENT_COLUMNS).length > 0;
    const changesPolicy = touchedColumns(data, TASK_POLICY_COLUMNS).length > 0;

    return this.db.transaction(async (tx) => {
      const runner = tx as OrviloDatabase;
      const [updated] = await runner
        .update(tasks)
        .set({
          ...data,
          ...TaskModel.reviewerBackfillSet(data.status, data.reviewerUserId),
          domainRevision: sql`${tasks.domainRevision} + 1`,
          ...(changesPolicy ? { policyRevision: sql`${tasks.policyRevision} + 1` } : {}),
          ...(changesRequirement
            ? { requirementRevision: sql`${tasks.requirementRevision} + 1` }
            : {}),
          updatedAt: new Date(),
        })
        .where(and(...updateWhere))
        .returning();
      const task = await resolveUpdate(runner, updated);
      if (!task) return null;

      if (this.workspaceId && !mutation.suppressDomainEvent) {
        await new LinearSyncModel(runner, this.workspaceId).recordTaskChangeInTransaction(runner, {
          changedFields,
          eventId: mutation.eventId,
          eventType,
          idempotencyKey:
            mutation.idempotencyKey ??
            `task:${task.id}:revision:${task.domainRevision}:${eventType}`,
          outboxPayload:
            data.parentTaskId !== undefined
              ? ({
                  action: 'upsert',
                  kind: 'relation',
                  relation: {
                    kind: 'parent',
                    localRelationKey: relationKey('parent', task.id, data.parentTaskId),
                    sourceTaskId: task.id,
                    targetTaskId: data.parentTaskId ?? null,
                  },
                } satisfies LinearExternalRelationOutboxPayload)
              : undefined,
          source: mutation.source ?? 'system',
          suppressLinearOutbox: mutation.suppressLinearOutbox,
          task,
        });
      }

      return task;
    });
  }

  /**
   * Move a task to a different business team (linear-workspace-v3). The task
   * keeps its identity; both the old and the new owner scope are marked dirty
   * so the previous planner drops it and the new planner picks it up.
   *
   * Scope dirtying follows the single-owner rule: when the task sits in a
   * project, the project scope is the planning owner regardless of team, so
   * only that scope is dirtied; a projectless task dirties old + new team
   * scopes (or the workspace scope when it had no team).
   */
  async moveToTeam(
    id: string,
    teamId: string | null,
    mutation: TaskMutationContext = {},
  ): Promise<TaskItem | null> {
    return this.db.transaction(async (tx) => {
      const runner = tx as OrviloDatabase;
      const [before] = await runner
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, id), this.ownership()))
        .limit(1);
      if (!before || before.teamId === teamId) return before ?? null;

      const moveWhere = [eq(tasks.id, id), this.ownership()];
      if (mutation.expectedDomainRevision !== undefined) {
        moveWhere.push(eq(tasks.domainRevision, mutation.expectedDomainRevision));
      }

      const [task] = await runner
        .update(tasks)
        .set({
          domainRevision: sql`${tasks.domainRevision} + 1`,
          teamId,
          updatedAt: new Date(),
        })
        .where(and(...moveWhere))
        .returning();
      if (!task) {
        if (mutation.expectedDomainRevision !== undefined) {
          const [current] = await runner
            .select({ id: tasks.id })
            .from(tasks)
            .where(and(eq(tasks.id, id), this.ownership()))
            .limit(1);
          if (current) throw new TaskRevisionConflictError();
        }
        return null;
      }

      if (this.workspaceId && !mutation.suppressDomainEvent) {
        const model = new LinearSyncModel(runner, this.workspaceId);
        const baseKey =
          mutation.idempotencyKey ?? `task:${task.id}:revision:${task.domainRevision}:task.moved`;

        // Previous owner scope — only when the task was actually owned by a
        // team scope (projectless). Project tasks dirty their project scope
        // through the regular change event below instead.
        if (!before.projectId && before.teamId) {
          await model.recordDomainEventInTransaction(runner, {
            eventId: mutation.eventId,
            idempotencyKey: `${baseKey}:from`,
            payload: {
              aggregateRevision: task.domainRevision,
              changedFields: ['teamId'],
              previousTeamId: before.teamId,
            },
            source: mutation.source ?? 'system',
            taskId: task.id,
            teamId: before.teamId,
            type: 'task.moved',
          });
        }

        await model.recordTaskChangeInTransaction(runner, {
          changedFields: ['teamId'],
          eventId: mutation.eventId,
          eventType: 'task.moved',
          idempotencyKey: `${baseKey}:to`,
          source: mutation.source ?? 'system',
          suppressLinearOutbox: mutation.suppressLinearOutbox,
          task,
        });
      }

      return task;
    });
  }

  /**
   * Delete a task. This does NOT touch the task's Work artifact: the Work
   * lifecycle is driven by the deleteTask tool call at the tool-execution
   * dispatch layer (which calls `WorkModel.deleteTaskWork`), so non-tool deletes
   * (UI / CLI / deleteAll) deliberately leave the Work as an orphan for the UI
   * to render as "resource deleted" from its version snapshot. See.
   */
  private async recordTaskDeleted(
    runner: OrviloDatabase,
    task: TaskItem,
    mutation: TaskMutationContext,
  ) {
    if (!this.workspaceId || mutation.suppressDomainEvent) return;
    await new LinearSyncModel(runner, this.workspaceId).recordDomainEventInTransaction(runner, {
      eventId: mutation.eventId,
      idempotencyKey:
        mutation.idempotencyKey ??
        `task:${task.id}:revision:${task.domainRevision + 1}:task.deleted`,
      payload: {
        aggregateRevision: task.domainRevision + 1,
        changedFields: ['deleted'],
        task: {
          identifier: task.identifier,
          projectId: task.projectId,
          requirementRevision: task.requirementRevision,
          visibility: task.visibility,
        },
      },
      projectId: task.projectId,
      source: mutation.source ?? 'system',
      taskId: task.id,
      type: 'task.deleted',
    });
  }

  async delete(id: string, mutation: TaskMutationContext = {}): Promise<boolean> {
    return (await this.deleteMany([id], mutation)).length > 0;
  }

  /** Validate the entire frozen deletion set before any rows disappear. */
  private async assertCanDeleteTasks(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const inbound = await this.db
      .select({ id: taskDependencies.id })
      .from(taskDependencies)
      .where(
        and(
          inArray(taskDependencies.dependsOnId, ids),
          notInArray(taskDependencies.taskId, ids),
          eq(taskDependencies.type, 'blocks'),
        ),
      )
      .limit(1);
    if (inbound.length > 0) {
      throw new TaskDependencyError('Remove blocking dependency links before deleting this task.');
    }
  }

  /** Full, unpaginated candidate set; callers can snapshot cleanup before deletion. */
  async getTaskIdsForDeletion(restrictToCreator = false): Promise<string[]> {
    const rows = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          this.ownership(),
          restrictToCreator ? eq(tasks.createdByUserId, this.userId) : undefined,
        ),
      );
    return rows.map(({ id }) => id);
  }

  /** Delete exactly these accessible tasks; return only ids actually deleted. */
  async deleteMany(ids: string[], mutation: TaskMutationContext = {}): Promise<string[]> {
    if (!this.dependencyLockHeld)
      return this.withDependencyLock((model) => model.deleteMany(ids, mutation));
    const accessible = await this.findByIds(ids);
    const liveIds = accessible.map(({ id }) => id);
    if (liveIds.length === 0) return [];
    await this.assertCanDeleteTasks(liveIds);
    for (const task of accessible) {
      await this.recordTaskDeleted(this.db, task, {
        ...mutation,
        idempotencyKey:
          mutation.idempotencyKey === undefined
            ? undefined
            : liveIds.length === 1
              ? mutation.idempotencyKey
              : `${mutation.idempotencyKey}:${task.id}`,
      });
    }
    const deleted = await this.db
      .delete(tasks)
      .where(and(inArray(tasks.id, liveIds), this.ownership()))
      .returning({ id: tasks.id });
    return deleted.map(({ id }) => id);
  }

  /**
   * Move a task and its full subtree to a new visibility (both directions —
   * added the `public → private` demotion; the router gates who
   * may call it).
   *
   * Cascades inside a single transaction:
   *   - the root task and every descendant in `tasks`;
   *   - `task_dependencies` and `task_documents` whose `task_id` is in the set.
   *
   * `task_topics` and `task_comments` are direction-sensitive. Their
   * `visibility` column is a write-time mirror of the parent task used as a
   * JOIN-free authorization proxy, so:
   *   - `private → public` deliberately does **not** cascade them: promoting
   *     the task must not retroactively expose runs and discussions that
   *     happened while it was private. Rows created after promotion inherit
   *     the task's then-current visibility through their own create paths.
   *   - `public → private` **does** cascade them: leaving public-era rows
   *     public would let workspace members keep reading/operating historical
   *     topics and comments of a task they can no longer see.
   *
   * Returns `null` if the root task is not visible to the current caller
   * (either missing or owned by another workspace member). Callers should
   * gate authorization (creator-only / admin) before invoking this.
   */
  async updateVisibility(
    id: string,
    visibility: 'private' | 'public',
    mutation: TaskMutationContext = {},
  ): Promise<TaskItem | null> {
    if (!this.dependencyLockHeld) {
      return this.withDependencyLock((model) => model.updateVisibility(id, visibility, mutation));
    }
    const root = await this.findById(id);
    if (!root) return null;
    if (root.visibility === visibility) return root;

    const descendants = await this.findAllDescendants(root.id);
    const taskIds = [root.id, ...descendants.map((d) => d.id)];
    const stamp = new Date();

    return this.db.transaction(async (tx) => {
      // Update the root with RETURNING so we read the post-update row in the
      // same statement. A second SELECT filtered by `ownership()` would self-
      // cancel when a workspace owner demotes another member's task to private:
      // the UPDATE filter sees the OLD (public) row and writes, but the read-
      // back filter sees the NEW (private + other-creator) row and returns 0
      // rows, so the caller would observe a NOT_FOUND error even though the
      // write succeeded.
      const [updated] = await tx
        .update(tasks)
        .set({
          domainRevision: sql`${tasks.domainRevision} + 1`,
          policyRevision: sql`${tasks.policyRevision} + 1`,
          updatedAt: stamp,
          visibility,
        })
        .where(and(eq(tasks.id, root.id), this.ownership()))
        .returning();

      const descendantIds = descendants.map((d) => d.id);
      let updatedDescendants: TaskItem[] = [];
      if (descendantIds.length > 0) {
        updatedDescendants = await tx
          .update(tasks)
          .set({
            domainRevision: sql`${tasks.domainRevision} + 1`,
            policyRevision: sql`${tasks.policyRevision} + 1`,
            updatedAt: stamp,
            visibility,
          })
          .where(and(inArray(tasks.id, descendantIds), this.ownership()))
          .returning();
      }

      await tx
        .update(taskDependencies)
        .set({ visibility })
        .where(and(inArray(taskDependencies.taskId, taskIds), this.depsOwnership()));

      await tx
        .update(taskDocuments)
        .set({ visibility })
        .where(and(inArray(taskDocuments.taskId, taskIds), this.docsOwnership()));

      // Work is a denormalized resource projection. Keep its indexed visibility
      // mirror in the same transaction as the task subtree so gallery/list
      // queries cannot observe a stale public row after demotion.
      await tx
        .update(works)
        .set({ visibility })
        .where(
          and(
            eq(works.resourceType, 'task'),
            inArray(works.resourceId, taskIds),
            buildWorkspaceWhere(
              { userId: this.userId, workspaceId: this.workspaceId },
              { userId: works.userId, workspaceId: works.workspaceId },
            ),
          ),
        );

      // Demotion-only cascade for the event-shaped child rows (see docstring):
      // their visibility mirrors the task, so pulling the task back to private
      // must also pull public-era topics/comments out of workspace scope.
      if (visibility === 'private') {
        await tx
          .update(taskTopics)
          .set({ visibility })
          .where(and(inArray(taskTopics.taskId, taskIds), this.topicsOwnership()));

        await tx
          .update(taskComments)
          .set({ visibility })
          .where(and(inArray(taskComments.taskId, taskIds), this.commentsOwnership()));

        await tx
          .update(taskActivities)
          .set({ visibility })
          .where(and(inArray(taskActivities.taskId, taskIds), this.activitiesOwnership()));
      }

      if (this.workspaceId && updated) {
        const model = new LinearSyncModel(tx as OrviloDatabase, this.workspaceId);
        for (const task of [updated, ...updatedDescendants]) {
          await model.recordTaskChangeInTransaction(tx as OrviloDatabase, {
            changedFields: ['visibility'],
            eventId: mutation.eventId,
            eventType: 'task.requirement.changed',
            idempotencyKey:
              mutation.idempotencyKey === undefined
                ? `task:${task.id}:revision:${task.domainRevision}:visibility`
                : `${mutation.idempotencyKey}:${task.id}`,
            source: mutation.source ?? 'user',
            suppressLinearOutbox: true,
            task,
          });
        }
      }

      return updated ?? null;
    });
  }

  /**
   * Count workspace tasks that would break if the given agent were demoted to
   * private:
   *   - public tasks assigned to it — a public task must never reference a
   *     private agent (`assertAgentVisibilityCompat`);
   *   - tasks created by anyone other than the agent's owner (any visibility)
   *     — after demotion those creators can no longer resolve the assignee,
   *     so their runs and assignee updates fail.
   * Deliberately workspace-wide and visibility-blind (NOT `ownership()`):
   * other members' private tasks are invisible to the caller but still lose
   * their assignee. Backs the router-level agent demotion guard.
   */
  async countTasksBlockingAgentDemotion(
    assigneeAgentId: string,
    agentOwnerUserId: string,
  ): Promise<number> {
    if (!this.workspaceId) return 0;
    const [row] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, this.workspaceId),
          eq(tasks.assigneeAgentId, assigneeAgentId),
          or(eq(tasks.visibility, 'public'), ne(tasks.createdByUserId, agentOwnerUserId)),
        ),
      );
    return Number(row?.count ?? 0);
  }

  /**
   * Whether the subtree rooted at `rootTaskId` (root excluded) contains tasks
   * created by someone other than `creatorUserId`. Deliberately workspace-wide
   * and visibility-blind: other members' private subtasks are invisible to the
   * caller but would still be fractured by a public→private demotion (each row
   * stays owned by its creator, so the root creator loses those descendants
   * while their creators keep orphaned children whose parent is hidden).
   * Backs the router-level task demotion guard.
   */
  async subtreeHasOtherCreators(rootTaskId: string, creatorUserId: string): Promise<boolean> {
    if (!this.workspaceId) return false;
    const result = await this.db.execute(sql`
      WITH RECURSIVE task_tree AS (
        SELECT id, created_by_user_id FROM tasks
          WHERE id = ${rootTaskId} AND workspace_id = ${this.workspaceId}
        UNION ALL
        SELECT t.id, t.created_by_user_id FROM tasks t
        JOIN task_tree tt ON t.parent_task_id = tt.id
      )
      SELECT 1 AS hit FROM task_tree
      WHERE id <> ${rootTaskId} AND created_by_user_id <> ${creatorUserId}
      LIMIT 1
    `);
    return result.rows.length > 0;
  }

  /** See {@link delete}: bulk task deletion likewise leaves Work artifacts intact. */
  async deleteAll(options?: {
    mutation?: TaskMutationContext;
    restrictToCreator?: boolean;
  }): Promise<number> {
    if (!this.dependencyLockHeld)
      return this.withDependencyLock((model) => model.deleteAll(options));
    const ids = await this.getTaskIdsForDeletion(options?.restrictToCreator);
    return (await this.deleteMany(ids, options?.mutation)).length;
  }

  /** Delete a task and every descendant in one transaction. */
  async deleteSubtree(rootTaskId: string, mutation: TaskMutationContext = {}): Promise<number> {
    if (!this.dependencyLockHeld)
      return this.withDependencyLock((model) => model.deleteSubtree(rootTaskId, mutation));
    if (!(await this.findById(rootTaskId))) return 0;
    const descendants = await this.findAllDescendants(rootTaskId);
    const taskIds = [rootTaskId, ...descendants.map(({ id }) => id)];
    await this.assertCanDeleteTasks(taskIds);

    return this.db.transaction(async (tx) => {
      const runner = tx as OrviloDatabase;
      const doomed = await runner
        .select()
        .from(tasks)
        .where(and(inArray(tasks.id, taskIds), this.ownership()))
        .for('update');
      for (const task of doomed) {
        await this.recordTaskDeleted(runner, task, {
          ...mutation,
          idempotencyKey:
            mutation.idempotencyKey === undefined
              ? undefined
              : `${mutation.idempotencyKey}:${task.id}`,
        });
      }
      await tx
        .delete(acceptances)
        .where(
          and(
            eq(acceptances.subjectType, 'task'),
            inArray(acceptances.subjectId, taskIds),
            buildWorkspaceWhere(
              { userId: this.userId, workspaceId: this.workspaceId },
              { userId: acceptances.userId, workspaceId: acceptances.workspaceId },
            ),
          ),
        );
      const result = await tx
        .delete(tasks)
        .where(and(inArray(tasks.id, taskIds), this.ownership()))
        .returning({ id: tasks.id });

      return result.length;
    });
  }

  // ========== Query ==========

  async groupList(
    options: TaskListFilterOptions & {
      excludeStatuses?: string[];
      groupBy?: 'agent' | 'assignee' | 'member' | 'priority';
      /**
       * Per-column page sizes for the dynamic groupings (agent/assignee/
       * member/priority), keyed by group key — the board bumps one column's
       * entry on "load more" without disturbing the others. The status path
       * already carries per-group limits inside `groups`, so it ignores this.
       */
      groupLimits?: Record<string, number>;
      groups?: Array<{
        key: string;
        limit?: number;
        offset?: number;
        statuses?: string[];
        workflowCategories?: TaskWorkflowCategory[];
      }>;
    },
  ): Promise<
    Array<{
      assigneeAgentId?: string | null;
      assigneeUserId?: string | null;
      hasMore: boolean;
      key: string;
      limit: number;
      offset: number;
      priority?: number;
      tasks: TaskItem[];
      total: number;
    }>
  > {
    const { assigneeAgentId, excludeStatuses, groupBy, groupLimits, groups } = options;

    if ((!groups || groups.length === 0) && !groupBy) {
      throw new Error('Task groups or a grouping dimension are required');
    }

    const DEFAULT_GROUP_LIMIT = 50;
    /**
     * The ranked-window paths fetch per partition in one pass, so the row cap
     * is uniform; per-key limits are applied by truncating each group's rows
     * afterwards. `hasMore` still compares against the true `total`.
     */
    const groupLimitFor = (key: string) => groupLimits?.[key] ?? DEFAULT_GROUP_LIMIT;
    const maxGroupLimit = Math.max(DEFAULT_GROUP_LIMIT, ...Object.values(groupLimits ?? {}));

    const baseConditions = this.buildListConditions(options);
    if (excludeStatuses?.length) {
      baseConditions.push(notInArray(tasks.status, excludeStatuses));
    }

    interface GroupQuery {
      assigneeAgentId?: string | null;
      assigneeUserId?: string | null;
      conditions: SQL[];
      key: string;
      limit: number;
      offset: number;
      prefetchedTasks?: TaskItem[];
      priority?: number;
      total: number;
    }

    let groupQueries: GroupQuery[];

    if (groupBy === 'assignee') {
      const assigneeGroupKey = sql<string>`case
        when ${tasks.assigneeAgentId} is not null then 'assignee:' || ${tasks.assigneeAgentId}
        when ${tasks.assigneeUserId} is not null then 'assignee:user:' || ${tasks.assigneeUserId}
        else 'assignee:unassigned'
      end`;
      const rankedTasks = this.db
        .select({
          ...getTableColumns(tasks),
          assigneeGroupKey: assigneeGroupKey.as('assignee_group_key'),
          groupRank:
            sql<number>`row_number() over (partition by ${assigneeGroupKey} order by ${taskEffectivePosition} asc, ${tasks.createdAt} desc, ${tasks.seq} desc)`.as(
              'group_rank',
            ),
        })
        .from(tasks)
        .where(and(...baseConditions))
        .as('ranked_assignee_tasks');
      const [countResult, rankedTaskRows] = await Promise.all([
        this.db
          .select({
            assigneeGroupKey: assigneeGroupKey.as('assignee_group_key'),
            count: sql<number>`count(*)`,
          })
          .from(tasks)
          .where(and(...baseConditions))
          .groupBy(assigneeGroupKey),
        this.db
          .select()
          .from(rankedTasks)
          .where(sql`${rankedTasks.groupRank} <= ${maxGroupLimit}`)
          .orderBy(rankedTasks.assigneeGroupKey, rankedTasks.groupRank),
      ]);
      const assigneeCounts = new Map(
        countResult.map((row) => [row.assigneeGroupKey, Number(row.count)]),
      );
      const tasksByAssignee = new Map<string, TaskItem[]>();
      for (const row of rankedTaskRows) {
        const { assigneeGroupKey: groupKey, groupRank: _groupRank, ...task } = row;
        const groupTasks = tasksByAssignee.get(groupKey) ?? [];
        groupTasks.push(task);
        tasksByAssignee.set(groupKey, groupTasks);
      }

      // `assignee` is the released hybrid grouping contract: agents take
      // precedence, member-only tasks get their own user group, and only tasks
      // with neither assignee are unassigned. New clients use `agent` for the
      // agent-only board instead of changing this existing API in place.
      if (!assigneeAgentId && !assigneeCounts.has('assignee:unassigned')) {
        assigneeCounts.set('assignee:unassigned', 0);
      }

      groupQueries = [...assigneeCounts.entries()].map(([key, total]) => {
        const isUnassigned = key === 'assignee:unassigned';
        const isUser = key.startsWith('assignee:user:');
        const groupAssigneeAgentId =
          isUnassigned || isUser
            ? isUnassigned
              ? null
              : undefined
            : key.slice('assignee:'.length);
        const groupAssigneeUserId = isUser
          ? key.slice('assignee:user:'.length)
          : isUnassigned
            ? null
            : undefined;
        const conditions = isUser
          ? [and(isNull(tasks.assigneeAgentId), eq(tasks.assigneeUserId, groupAssigneeUserId!))!]
          : isUnassigned
            ? [and(isNull(tasks.assigneeAgentId), isNull(tasks.assigneeUserId))!]
            : [eq(tasks.assigneeAgentId, groupAssigneeAgentId!)];

        return {
          assigneeAgentId: groupAssigneeAgentId,
          assigneeUserId: groupAssigneeUserId,
          conditions,
          key,
          limit: groupLimitFor(key),
          offset: 0,
          prefetchedTasks: (tasksByAssignee.get(key) ?? []).slice(0, groupLimitFor(key)),
          total,
        };
      });
    } else if (groupBy === 'agent' || groupBy === 'member') {
      const groupColumn = groupBy === 'agent' ? tasks.assigneeAgentId : tasks.assigneeUserId;
      const groupPrefix = groupBy === 'agent' ? 'assignee:' : 'member:';
      const unassignedKey = `${groupPrefix}unassigned`;
      const assigneeGroupKey = sql<string>`case
        when ${groupColumn} is not null then ${groupPrefix} || ${groupColumn}
        else ${unassignedKey}
      end`;
      const rankedTasks = this.db
        .select({
          ...getTableColumns(tasks),
          assigneeGroupKey: assigneeGroupKey.as('assignee_group_key'),
          groupRank:
            sql<number>`row_number() over (partition by ${assigneeGroupKey} order by ${taskEffectivePosition} asc, ${tasks.createdAt} desc, ${tasks.seq} desc)`.as(
              'group_rank',
            ),
        })
        .from(tasks)
        .where(and(...baseConditions))
        .as('ranked_assignee_tasks');
      const [countResult, rankedTaskRows] = await Promise.all([
        this.db
          .select({
            assigneeId: groupColumn,
            count: sql<number>`count(*)`,
          })
          .from(tasks)
          .where(and(...baseConditions))
          .groupBy(groupColumn),
        this.db
          .select()
          .from(rankedTasks)
          .where(sql`${rankedTasks.groupRank} <= ${maxGroupLimit}`)
          .orderBy(rankedTasks.assigneeGroupKey, rankedTasks.groupRank),
      ]);
      const assigneeCounts = new Map(
        countResult.map((row) => [
          row.assigneeId ? `${groupPrefix}${row.assigneeId}` : unassignedKey,
          Number(row.count),
        ]),
      );
      const tasksByAssignee = new Map<string, TaskItem[]>();
      for (const row of rankedTaskRows) {
        const { assigneeGroupKey: groupKey, groupRank: _groupRank, ...task } = row;
        const groupTasks = tasksByAssignee.get(groupKey) ?? [];
        groupTasks.push(task);
        tasksByAssignee.set(groupKey, groupTasks);
      }

      // Keep an empty Unassigned column as a stable drop target. Agent-scoped
      // boards omit the Agent-unassigned column because their base filter
      // guarantees one assignee, while Member grouping remains independent.
      if ((groupBy === 'member' || !assigneeAgentId) && !assigneeCounts.has(unassignedKey)) {
        assigneeCounts.set(unassignedKey, 0);
      }

      groupQueries = [...assigneeCounts.entries()].map(([key, total]) => {
        const isUnassigned = key === unassignedKey;
        const assigneeId = isUnassigned ? null : key.slice(groupPrefix.length);
        const groupAssigneeAgentId = groupBy === 'agent' ? assigneeId : undefined;
        const groupAssigneeUserId = groupBy === 'member' ? assigneeId : undefined;
        const conditions = [isUnassigned ? isNull(groupColumn) : eq(groupColumn, assigneeId!)];

        return {
          assigneeAgentId: groupAssigneeAgentId,
          assigneeUserId: groupAssigneeUserId,
          conditions,
          key,
          limit: groupLimitFor(key),
          offset: 0,
          prefetchedTasks: (tasksByAssignee.get(key) ?? []).slice(0, groupLimitFor(key)),
          total,
        };
      });
    } else if (groupBy === 'priority') {
      const priorities = [1, 2, 3, 4, 0];
      const countQuery = this.db
        .select({ count: sql<number>`count(*)`, priority: tasks.priority })
        .from(tasks)
        .where(and(...baseConditions))
        .groupBy(tasks.priority);
      const taskQueries = priorities.map(async (priority) => {
        const conditions = [
          priority === 0
            ? or(eq(tasks.priority, priority), isNull(tasks.priority))!
            : eq(tasks.priority, priority),
        ];
        const key = `priority:${priority}`;
        const limit = groupLimitFor(key);
        const offset = 0;
        const prefetchedTasks = await this.db
          .select()
          .from(tasks)
          .where(and(...baseConditions, ...conditions))
          .orderBy(...TASK_BOARD_ORDER)
          .limit(limit)
          .offset(offset);

        return {
          conditions,
          key: `priority:${priority}`,
          limit,
          offset,
          prefetchedTasks,
          priority,
          total: 0,
        };
      });
      const [countResult, queriedGroups] = await Promise.all([
        countQuery,
        Promise.all(taskQueries),
      ]);
      const priorityCounts = new Map<number, number>();
      for (const row of countResult) {
        const priority = row.priority ?? 0;
        priorityCounts.set(priority, (priorityCounts.get(priority) ?? 0) + Number(row.count));
      }

      // Priority is a finite dimension, so include empty values as usable drop
      // targets. The order matches the task list's semantic rank.
      groupQueries = queriedGroups.map((group) => ({
        ...group,
        total: priorityCounts.get(group.priority) ?? 0,
      }));
    } else {
      const statusGroups = (groups ?? []).map((group) => ({
        ...group,
        statuses: Array.from(new Set(group.statuses ?? [])),
        workflowCategories: Array.from(new Set(group.workflowCategories ?? [])),
      }));
      const taskQueries = statusGroups.map(async (group) => {
        const linkedWorkflowCondition =
          group.workflowCategories.length > 0
            ? and(
                or(isNotNull(tasks.workflowStateRefId), isNotNull(tasks.workflowStateId)),
                inArray(tasks.workflowCategory, group.workflowCategories),
              )
            : undefined;
        const legacyStatusCondition =
          group.statuses.length > 0
            ? group.workflowCategories.length > 0
              ? and(
                  isNull(tasks.workflowStateRefId),
                  isNull(tasks.workflowStateId),
                  inArray(tasks.status, group.statuses),
                )
              : inArray(tasks.status, group.statuses)
            : undefined;
        const membership = or(linkedWorkflowCondition, legacyStatusCondition);
        if (!membership) throw new Error(`Task group ${group.key} has no membership criteria`);
        const conditions = [membership];
        const limit = group.limit ?? 50;
        const offset = group.offset ?? 0;
        const [countResult, prefetchedTasks] = await Promise.all([
          this.db
            .select({ count: sql<number>`count(*)` })
            .from(tasks)
            .where(and(...baseConditions, ...conditions)),
          this.db
            .select()
            .from(tasks)
            .where(and(...baseConditions, ...conditions))
            .orderBy(...TASK_BOARD_ORDER)
            .limit(limit)
            .offset(offset),
        ]);

        return {
          conditions,
          key: group.key,
          limit,
          offset,
          prefetchedTasks,
          total: Number(countResult[0]?.count ?? 0),
        };
      });
      groupQueries = await Promise.all(taskQueries);
    }

    const results = await Promise.all(
      groupQueries.map(async (group) => {
        const groupTasks =
          group.prefetchedTasks ??
          (await this.db
            .select()
            .from(tasks)
            .where(and(...baseConditions, ...group.conditions))
            .orderBy(...TASK_BOARD_ORDER)
            .limit(group.limit)
            .offset(group.offset));

        return {
          ...(group.assigneeAgentId !== undefined
            ? { assigneeAgentId: group.assigneeAgentId }
            : {}),
          ...(group.assigneeUserId !== undefined ? { assigneeUserId: group.assigneeUserId } : {}),
          hasMore: group.offset + groupTasks.length < group.total,
          key: group.key,
          limit: group.limit,
          offset: group.offset,
          ...(group.priority !== undefined ? { priority: group.priority } : {}),
          tasks: groupTasks,
          total: group.total,
        };
      }),
    );

    const taskIds = Array.from(
      new Set(results.flatMap((group) => group.tasks.map(({ id }) => id))),
    );
    const [runStats, subtaskProgressByTaskId] = await Promise.all([
      this.runStatsByTaskIds(taskIds),
      this.subtaskProgressByTaskIds(taskIds),
    ]);
    const runStatsByTaskId = new Map(
      runStats.map((stats) => [
        stats.root_id,
        {
          totalRunCost: Number(stats.total_run_cost),
          totalRunDuration: Number(stats.total_run_duration),
        },
      ]),
    );

    return results.map((group) => ({
      ...group,
      tasks: group.tasks.map((task) => ({
        ...task,
        subtaskProgress: subtaskProgressByTaskId.get(task.id),
        totalRunCost: runStatsByTaskId.get(task.id)?.totalRunCost ?? 0,
        totalRunDuration: runStatsByTaskId.get(task.id)?.totalRunDuration ?? 0,
      })),
    }));
  }

  private async runStatsByTaskIds(taskIds: string[]): Promise<TaskRunStats[]> {
    if (taskIds.length === 0) return [];

    const result = await this.db.execute<TaskRunStats>(sql`
      WITH RECURSIVE goal_tree AS (
        SELECT ${tasks.id} AS root_id, ${tasks.id} AS task_id
        FROM ${tasks}
        WHERE ${inArray(tasks.id, taskIds)} AND ${this.ownership()}
        UNION ALL
        SELECT goal_tree.root_id, child.id
        FROM ${tasks} child
        JOIN goal_tree ON child.parent_task_id = goal_tree.task_id
        WHERE ${this.ownershipSql('child')}
      )
      SELECT
        goal_tree.root_id,
        coalesce(sum(${topics.totalCost}), 0) AS total_run_cost,
        coalesce(
          sum(extract(epoch from (${topics.completedAt} - ${taskTopics.createdAt})) * 1000)
            filter (where ${topics.completedAt} is not null),
          0
        ) AS total_run_duration
      FROM goal_tree
      LEFT JOIN ${taskTopics} ON ${taskTopics.taskId} = goal_tree.task_id
      LEFT JOIN ${topics} ON ${topics.id} = ${taskTopics.topicId}
      GROUP BY goal_tree.root_id
    `);

    return result.rows;
  }

  private async subtaskProgressByTaskIds(
    taskIds: string[],
  ): Promise<Map<string, TaskSubtaskProgress>> {
    if (taskIds.length === 0) return new Map();

    const result = await this.db.execute<TaskSubtaskProgressRow>(sql`
      WITH RECURSIVE task_tree AS (
        SELECT ${tasks.id} AS root_id, ${tasks.id} AS task_id, ${tasks.status} AS status
        FROM ${tasks}
        WHERE ${inArray(tasks.id, taskIds)} AND ${this.ownership()}
        UNION ALL
        SELECT task_tree.root_id, child.id, child.status
        FROM ${tasks} child
        JOIN task_tree ON child.parent_task_id = task_tree.task_id
        WHERE ${this.ownershipSql('child')}
      )
      SELECT
        task_tree.root_id,
        count(*) filter (
          where task_tree.task_id <> task_tree.root_id and task_tree.status = 'completed'
        ) AS completed,
        count(*) filter (where task_tree.task_id <> task_tree.root_id) AS total
      FROM task_tree
      GROUP BY task_tree.root_id
    `);

    return new Map(
      result.rows.map((progress) => [
        progress.root_id,
        { completed: Number(progress.completed), total: Number(progress.total) },
      ]),
    );
  }

  async list(options: TaskListOptions = {}): Promise<{ tasks: TaskItem[]; total: number }> {
    const { after, statuses, priorities, limit = 50, offset = 0, orderBy = 'createdAt' } = options;
    const orderColumn = orderBy === 'updatedAt' ? tasks.updatedAt : tasks.createdAt;

    const conditions = this.buildListConditions(options);

    if (statuses?.length) conditions.push(inArray(tasks.status, statuses));
    if (priorities?.length) conditions.push(inArray(tasks.priority, priorities));
    if (after) {
      conditions.push(
        or(
          lt(orderColumn, after.at),
          and(eq(orderColumn, after.at), lt(tasks.seq, after.seq)),
        ) as SQL,
      );
    }

    const where = and(...conditions);

    const countQuery = this.db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(where);

    const taskListQuery = this.db
      .select()
      .from(tasks)
      .where(where)
      // `seq` breaks timestamp ties so the order is total — required for the
      // keyset cursor above and for offset pages to never repeat or skip a row.
      .orderBy(desc(orderColumn), desc(tasks.seq))
      .limit(limit)
      .offset(offset);
    const [countResult, taskList] = await Promise.all([countQuery, taskListQuery]);
    const subtaskProgressByTaskId = await this.subtaskProgressByTaskIds(
      taskList.map(({ id }) => id),
    );

    return {
      tasks: taskList.map((task) => ({
        ...task,
        subtaskProgress: subtaskProgressByTaskId.get(task.id),
      })),
      total: Number(countResult[0].count),
    };
  }

  /**
   * Batch update sortOrder for multiple tasks.
   * @param order Array of { id, sortOrder } pairs
   */
  async reorder(order: Array<{ id: string; sortOrder: number }>): Promise<void> {
    for (const item of order) {
      await this.db
        .update(tasks)
        .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
        .where(and(eq(tasks.id, item.id), this.ownership()));
    }
  }

  /**
   * The position a kanban drop lands on, computed from the two cards framing
   * the drop slot (`beforeId` is the card above, `afterId` the card below —
   * either may be an `id` or an `identifier`). Rows without an explicit
   * `position` use the same `-epoch(created_at)` fallback the board ordering
   * applies, so an untouched column and a dragged card interleave correctly.
   * Returns null when both anchors are gone — the write then leaves the
   * position untouched instead of guessing.
   *
   * `scope` is the dropped column's membership (status set, assignee, or
   * priority). A missing anchor means the drop hit the loaded page's edge —
   * but the column can continue past it, so the true in-scope neighbour is
   * fetched instead of stepping blindly past unseen rows. When repeated
   * midpoint halving exhausts double precision the column is respaced once.
   */
  async computeMovePosition(
    anchors: { afterId?: string | null; beforeId?: string | null },
    scope?: TaskMoveScope,
    excludeId?: string,
  ): Promise<number | null> {
    const ids = [anchors.beforeId, anchors.afterId].filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    if (ids.length === 0) return null;

    const rows = await this.resolveMany(ids);
    const find = (id?: string | null) =>
      id ? rows.find((row) => row.id === id || row.identifier === id.toUpperCase()) : undefined;
    const before = find(anchors.beforeId);
    const after = find(anchors.afterId);
    if (!before && !after) return null;

    const effectivePosition = (task: TaskItem) =>
      task.position ?? -new Date(task.createdAt).getTime() / 1000;

    // The rows framing the slot: the resolved anchor on one side, the true
    // in-scope neighbour on the side the loaded page never reached. A real
    // column edge (no neighbour in scope) falls back to one step past the
    // boundary, preserving the legacy no-scope behaviour.
    const lo =
      before ??
      (scope && after ? await this.moveScopeNeighbour(after, scope, 'prev', excludeId) : undefined);
    const hi =
      after ??
      (scope && before
        ? await this.moveScopeNeighbour(before, scope, 'next', excludeId)
        : undefined);
    if (!lo && !hi) return null;
    if (!lo) return effectivePosition(hi!) - 1;
    if (!hi) return effectivePosition(lo) + 1;

    const loPos = effectivePosition(lo);
    const hiPos = effectivePosition(hi);
    const mid = (loPos + hiPos) / 2;
    if (mid > loPos && mid < hiPos) return mid;

    // The gap collapsed to an endpoint — repeated midpoint halving ran out of
    // double precision (or the anchors tie). Respace the whole column and take
    // the reopened midpoint. Without a scope there is no column to respace;
    // the degenerate midpoint keeps the write a harmless reorder.
    if (!scope) return mid;
    const [freshLo, freshHi] = await this.rebalanceMoveScope(scope, [lo.id, hi.id]);
    const reopened = (freshLo + freshHi) / 2;
    return reopened > freshLo && reopened < freshHi ? reopened : freshLo;
  }

  /**
   * The membership filters of a kanban drop scope. Each present key
   * constrains the column — a `null` assignee means the unassigned column,
   * not "no constraint", and the `priority:0` column also holds NULL
   * priorities (its key matches `taskPriorityGroupKey`).
   */
  private moveScopeConditions(scope: TaskMoveScope): SQL[] {
    const conditions: SQL[] = [];
    if (scope.workflowCategories?.length) {
      conditions.push(
        or(
          and(
            or(isNotNull(tasks.workflowStateRefId), isNotNull(tasks.workflowStateId)),
            inArray(tasks.workflowCategory, scope.workflowCategories),
          ),
          scope.statuses?.length
            ? and(
                isNull(tasks.workflowStateRefId),
                isNull(tasks.workflowStateId),
                inArray(tasks.status, scope.statuses),
              )
            : undefined,
        ) as SQL,
      );
    } else if (scope.statuses?.length) {
      conditions.push(inArray(tasks.status, scope.statuses));
    }
    if ('assigneeAgentId' in scope) {
      conditions.push(
        scope.assigneeAgentId == null
          ? isNull(tasks.assigneeAgentId)
          : eq(tasks.assigneeAgentId, scope.assigneeAgentId),
      );
    }
    if ('assigneeUserId' in scope) {
      conditions.push(
        scope.assigneeUserId == null
          ? isNull(tasks.assigneeUserId)
          : eq(tasks.assigneeUserId, scope.assigneeUserId),
      );
    }
    if (scope.priority !== undefined) {
      conditions.push(
        scope.priority === 0
          ? (or(eq(tasks.priority, 0), isNull(tasks.priority)) as SQL)
          : eq(tasks.priority, scope.priority),
      );
    }
    return conditions;
  }

  /**
   * The row immediately before/after `boundary` inside the dropped column's
   * scope, in board order (`position` fallback, then `createdAt`/`seq`
   * tiebreaks). Finds the card the loaded page never rendered, so a drop at
   * a paginated edge lands against the true successor instead of past it.
   */
  private async moveScopeNeighbour(
    boundary: TaskItem,
    scope: TaskMoveScope,
    direction: 'next' | 'prev',
    excludeId?: string,
  ): Promise<TaskItem | undefined> {
    const bound = boundary.position ?? -new Date(boundary.createdAt).getTime() / 1000;
    const boundaryCreatedAt = boundary.createdAt;
    const boundarySeq = boundary.seq;
    const next = direction === 'next';
    // "Past the boundary" in board order (effPos asc, createdAt desc, seq
    // desc): strictly later means a bigger key, or a tie broken by an older
    // createdAt / smaller seq. 'prev' mirrors the comparison.
    const past = sql`(${taskEffectivePosition} > ${bound}
      or (${taskEffectivePosition} = ${bound} and ${tasks.createdAt} < ${boundaryCreatedAt})
      or (${taskEffectivePosition} = ${bound} and ${tasks.createdAt} = ${boundaryCreatedAt} and ${tasks.seq} < ${boundarySeq}))`;
    const earlier = sql`(${taskEffectivePosition} < ${bound}
      or (${taskEffectivePosition} = ${bound} and ${tasks.createdAt} > ${boundaryCreatedAt})
      or (${taskEffectivePosition} = ${bound} and ${tasks.createdAt} = ${boundaryCreatedAt} and ${tasks.seq} > ${boundarySeq}))`;
    const rows = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          this.ownership(),
          ...this.moveScopeConditions(scope),
          next ? past : earlier,
          excludeId ? ne(tasks.id, excludeId) : undefined,
        ),
      )
      .orderBy(
        next ? sql`${taskEffectivePosition} asc` : sql`${taskEffectivePosition} desc`,
        next ? desc(tasks.createdAt) : sql`${tasks.createdAt} asc`,
        next ? desc(tasks.seq) : sql`${tasks.seq} asc`,
      )
      .limit(1);
    return rows[0];
  }

  /**
   * Respaces a column whose fractional positions collapsed. Every in-scope
   * row gets a fixed-step slot in current board order, reopening the gap the
   * drop needs; returns the boundary rows' fresh positions.
   */
  private async rebalanceMoveScope(
    scope: TaskMoveScope,
    boundaryIds: [string, string],
  ): Promise<[number, number]> {
    const conditions = and(this.ownership(), ...this.moveScopeConditions(scope));
    await this.db.execute(sql`
      update ${tasks}
      set position = sub.rn * ${MOVE_REBALANCE_STEP}
      from (
        select ${tasks.id} as id,
               row_number() over (
                 order by ${taskEffectivePosition} asc, ${tasks.createdAt} desc, ${tasks.seq} desc
               ) as rn
        from ${tasks}
        where ${conditions ?? sql`true`}
      ) sub
      where ${tasks.id} = sub.id
    `);
    const [loId, hiId] = boundaryIds;
    const fresh = await this.db
      .select({ id: tasks.id, position: tasks.position })
      .from(tasks)
      .where(and(inArray(tasks.id, [loId, hiId]), this.ownership()));
    const positionOf = (id: string, fallback: number) =>
      fresh.find((row) => row.id === id)?.position ?? fallback;
    return [positionOf(loId, 0), positionOf(hiId, MOVE_REBALANCE_STEP)];
  }

  async findSubtasks(parentTaskId: string): Promise<TaskItem[]> {
    return this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.parentTaskId, parentTaskId), this.ownership()))
      .orderBy(tasks.sortOrder, tasks.seq);
  }

  /**
   * Fetch all descendants of a root task using Drizzle select() (returns camelCase fields).
   * Uses breadth-first traversal with O(depth) queries.
   */
  async findAllDescendants(rootTaskId: string): Promise<TaskItem[]> {
    const all: TaskItem[] = [];
    let parentIds = [rootTaskId];

    while (parentIds.length > 0) {
      const children = await this.db
        .select()
        .from(tasks)
        .where(and(inArray(tasks.parentTaskId, parentIds), this.ownership()))
        .orderBy(tasks.sortOrder, tasks.seq);

      if (children.length === 0) break;

      all.push(...children);
      parentIds = children.map((c) => c.id);
    }

    return all;
  }

  // Recursive query to get full task tree
  async getTaskTree(rootTaskId: string): Promise<TaskItem[]> {
    const ownership = this.ownershipSql();
    const childOwnership = this.ownershipSql('t');
    const result = await this.db.execute(sql`
      WITH RECURSIVE task_tree AS (
        SELECT * FROM tasks WHERE id = ${rootTaskId} AND ${ownership}
        UNION ALL
        SELECT t.* FROM tasks t
        JOIN task_tree tt ON t.parent_task_id = tt.id
        WHERE ${childOwnership}
      )
      SELECT * FROM task_tree
    `);

    return result.rows as unknown as TaskItem[];
  }

  /**
   * For a list of task IDs, find all agent IDs (assignee + creator) across their full task trees.
   * Walks UP to find root, then DOWN to collect all agents.
   * Returns { [inputTaskId]: agentId[] }
   */
  async getTreeAgentIdsForTaskIds(taskIds: string[]): Promise<Record<string, string[]>> {
    if (taskIds.length === 0) return {};

    const taskIdParams = taskIds.map((id) => sql`${id}`);
    const taskIdList = sql.join(taskIdParams, sql`, `);

    const ownershipBare = this.ownershipSql();
    const ownershipAliased = this.ownershipSql('t');
    const result = await this.db.execute(sql`
      WITH RECURSIVE
      ancestors AS (
        SELECT id AS origin_id, id, parent_task_id
        FROM tasks
        WHERE id IN (${taskIdList})
          AND ${ownershipBare}
        UNION ALL
        SELECT a.origin_id, t.id, t.parent_task_id
        FROM tasks t
        JOIN ancestors a ON t.id = a.parent_task_id
        WHERE ${ownershipAliased}
      ),
      roots AS (
        SELECT DISTINCT ON (origin_id) origin_id, id AS root_id
        FROM ancestors
        WHERE parent_task_id IS NULL
      ),
      descendants AS (
        SELECT r.origin_id, t.id, t.assignee_agent_id, t.created_by_agent_id
        FROM tasks t
        JOIN roots r ON t.id = r.root_id
        WHERE ${ownershipAliased}
        UNION ALL
        SELECT d.origin_id, t.id, t.assignee_agent_id, t.created_by_agent_id
        FROM tasks t
        JOIN descendants d ON t.parent_task_id = d.id
        WHERE ${ownershipAliased}
      )
      SELECT origin_id, assignee_agent_id, created_by_agent_id
      FROM descendants
      WHERE assignee_agent_id IS NOT NULL OR created_by_agent_id IS NOT NULL
    `);

    const map: Record<string, Set<string>> = {};
    for (const row of result.rows as any[]) {
      const originId = row.origin_id as string;
      if (!map[originId]) map[originId] = new Set();
      if (row.assignee_agent_id) map[originId].add(row.assignee_agent_id as string);
      if (row.created_by_agent_id) map[originId].add(row.created_by_agent_id as string);
    }

    return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, Array.from(v)]));
  }

  // ========== Status ==========

  async updateStatus(
    id: string,
    status: string,
    extra?: {
      completedAt?: Date;
      error?: string | null;
      runReservationExpiresAt?: Date | null;
      runReservationId?: string | null;
      startedAt?: Date;
    },
  ): Promise<TaskItem | null> {
    return this.update(id, { status, ...extra });
  }

  /** Atomically transition a task only while it still has the expected status. */
  async updateStatusIfCurrent(
    id: string,
    currentStatus: string,
    status: string,
    extra?: {
      completedAt?: Date;
      error?: string | null;
      runReservationExpiresAt?: Date | null;
      runReservationId?: string | null;
      startedAt?: Date;
    },
    mutation: TaskMutationContext = {},
  ): Promise<TaskItem | null> {
    if (!this.dependencyLockHeld) {
      return this.withDependencyLock((model) =>
        model.updateStatusIfCurrent(id, currentStatus, status, extra, mutation),
      );
    }
    const current = await this.findById(id);
    if (!current || current.status !== currentStatus) return null;
    await this.assertDependenciesForStatus([id], status);
    const [task] = await this.db
      .update(tasks)
      .set({
        status,
        updatedAt: new Date(),
        ...extra,
        ...TaskModel.reviewerBackfillSet(status),
        domainRevision: sql`${tasks.domainRevision} + 1`,
      })
      .where(and(eq(tasks.id, id), eq(tasks.status, currentStatus), this.ownership()))
      .returning();
    if (!task) return null;
    if (this.workspaceId && !mutation.suppressDomainEvent) {
      await new LinearSyncModel(this.db, this.workspaceId).recordTaskChangeInTransaction(this.db, {
        changedFields: ['status'],
        eventId: mutation.eventId,
        eventType: 'task.status.changed',
        idempotencyKey:
          mutation.idempotencyKey ??
          `task:${task.id}:revision:${task.domainRevision}:task.status.changed`,
        source: mutation.source ?? 'system',
        suppressLinearOutbox: mutation.suppressLinearOutbox,
        task,
      });
    }
    return task;
  }

  /**
   * Transition only while the caller still owns the active run/completion
   * generation. User status changes clear this token, fencing any lifecycle
   * work that was already in progress.
   */
  async updateStatusIfReservation(
    id: string,
    reservationId: string,
    currentStatus: string,
    status: string,
    extra?: {
      completedAt?: Date;
      error?: string | null;
      runReservationExpiresAt?: Date | null;
      runReservationId?: string | null;
      startedAt?: Date;
    },
  ): Promise<TaskItem | null> {
    if (!this.dependencyLockHeld) {
      return this.withDependencyLock((model) =>
        model.updateStatusIfReservation(id, reservationId, currentStatus, status, extra),
      );
    }
    const current = await this.findById(id);
    if (
      !current ||
      current.status !== currentStatus ||
      current.runReservationId !== reservationId
    ) {
      return null;
    }
    await this.assertDependenciesForStatus([id], status);
    const [task] = await this.db
      .update(tasks)
      .set({
        status,
        updatedAt: new Date(),
        ...extra,
        ...TaskModel.reviewerBackfillSet(status),
      })
      .where(
        and(
          eq(tasks.id, id),
          eq(tasks.runReservationId, reservationId),
          eq(tasks.status, currentStatus),
          this.ownership(),
        ),
      )
      .returning();

    return task ?? null;
  }

  /** Merge task context only while the caller still owns the run generation. */
  async updateContextIfReservation(
    id: string,
    reservationId: string,
    partial: Record<string, unknown>,
  ): Promise<boolean> {
    const task = await this.findById(id);
    if (!task || task.runReservationId !== reservationId) return false;

    const current = (task.context as Record<string, unknown>) || {};
    const [updated] = await this.db
      .update(tasks)
      .set({ context: merge(current, partial), updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.runReservationId, reservationId), this.ownership()))
      .returning({ id: tasks.id });
    return Boolean(updated);
  }

  /** Merge context only while the task remains in the expected lifecycle state. */
  async updateContextIfStatus(
    id: string,
    status: string,
    partial: Record<string, unknown>,
  ): Promise<boolean> {
    const task = await this.findById(id);
    if (!task || task.status !== status) return false;

    const current = (task.context as Record<string, unknown>) || {};
    const [updated] = await this.db
      .update(tasks)
      .set({ context: merge(current, partial), updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.status, status), this.ownership()))
      .returning({ id: tasks.id });
    return Boolean(updated);
  }

  /**
   * Atomically reserve the single dispatch slot for a task.
   *
   * The durable lease closes both races around the pre-dispatch gap: a second
   * caller cannot provision while this caller has not written its topic yet,
   * and a crashed caller becomes reclaimable after the deadline. The topic
   * subquery keeps an already-dispatched generation authoritative after the
   * short reservation is released.
   */
  async reserveRun(
    id: string,
    reservationId: string,
    now: Date = new Date(),
    leaseMs = 30 * 60 * 1000,
    replaceReservationId?: string,
  ): Promise<boolean> {
    if (!this.dependencyLockHeld) {
      return this.withDependencyLock((model) =>
        model.reserveRun(id, reservationId, now, leaseMs, replaceReservationId),
      );
    }
    await this.assertDependenciesForStatus([id], 'running');
    const reserved = await this.db
      .update(tasks)
      .set({
        error: null,
        runReservationExpiresAt: new Date(now.getTime() + leaseMs),
        runReservationId: reservationId,
        startedAt: now,
        status: 'running',
        updatedAt: now,
      })
      .where(
        and(
          eq(tasks.id, id),
          or(
            isNull(tasks.runReservationId),
            lt(tasks.runReservationExpiresAt, now),
            replaceReservationId ? eq(tasks.runReservationId, replaceReservationId) : undefined,
          ),
          notExists(
            this.db
              .select({ id: taskTopics.id })
              .from(taskTopics)
              .where(and(eq(taskTopics.taskId, id), eq(taskTopics.status, 'running'))),
          ),
          notExists(
            this.db
              .select({ id: agentOperations.id })
              .from(agentOperations)
              .where(
                and(
                  eq(agentOperations.taskId, id),
                  notInArray(agentOperations.status, ['abandoned', 'done', 'error', 'interrupted']),
                ),
              ),
          ),
          this.ownership(),
        ),
      )
      .returning({ id: tasks.id });

    return reserved.length > 0;
  }

  /** Extend a dispatch lease only while the caller still owns it. */
  async renewRunReservation(
    id: string,
    reservationId: string,
    now: Date = new Date(),
    leaseMs = 30 * 60 * 1000,
  ): Promise<boolean> {
    const renewed = await this.db
      .update(tasks)
      .set({ runReservationExpiresAt: new Date(now.getTime() + leaseMs), updatedAt: now })
      .where(and(eq(tasks.id, id), eq(tasks.runReservationId, reservationId), this.ownership()))
      .returning({ id: tasks.id });

    return renewed.length > 0;
  }

  /** Release a dispatch reservation without changing the task lifecycle. */
  async releaseRunReservation(id: string, reservationId: string): Promise<boolean> {
    const released = await this.db
      .update(tasks)
      .set({ runReservationExpiresAt: null, runReservationId: null, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.runReservationId, reservationId), this.ownership()))
      .returning({ id: tasks.id });

    return released.length > 0;
  }

  /** Roll back only the dispatch generation owned by `reservationId`. */
  async failRunReservation(
    id: string,
    reservationId: string,
    status: 'backlog' | 'paused' | 'scheduled',
    error: string,
  ): Promise<boolean> {
    const released = await this.db
      .update(tasks)
      .set({
        error,
        runReservationExpiresAt: null,
        runReservationId: null,
        status,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, id), eq(tasks.runReservationId, reservationId), this.ownership()))
      .returning({ id: tasks.id });

    return released.length > 0;
  }

  /**
   * Transition execution state only while the Task still matches the immutable
   * contract captured by its dispatch. Verification can finish well after the
   * builder run, so a plain status CAS is insufficient: a changed requirement,
   * policy, generation, or assignee must keep the old verdict historical.
   */
  async updateStatusForExecutionContract(
    id: string,
    status: string,
    expected: {
      assigneeAgentId: string | null;
      executionGeneration: number;
      policyRevision: number;
      requirementRevision: number;
      runReservationId?: string;
      status?: string;
    },
    extra?: {
      completedAt?: Date;
      error?: string | null;
      runReservationExpiresAt?: Date | null;
      runReservationId?: string | null;
      startedAt?: Date;
    },
    mutation: TaskMutationContext = {},
  ): Promise<TaskItem | null> {
    return this.db.transaction(async (tx) => {
      const runner = tx as OrviloDatabase;
      const [task] = await runner
        .update(tasks)
        .set({
          status,
          updatedAt: new Date(),
          ...extra,
          ...TaskModel.reviewerBackfillSet(status),
          domainRevision: sql`${tasks.domainRevision} + 1`,
        })
        .where(
          and(
            eq(tasks.id, id),
            eq(tasks.executionGeneration, expected.executionGeneration),
            eq(tasks.policyRevision, expected.policyRevision),
            eq(tasks.requirementRevision, expected.requirementRevision),
            expected.status ? eq(tasks.status, expected.status) : undefined,
            expected.runReservationId
              ? eq(tasks.runReservationId, expected.runReservationId)
              : undefined,
            expected.assigneeAgentId === null
              ? isNull(tasks.assigneeAgentId)
              : eq(tasks.assigneeAgentId, expected.assigneeAgentId),
            this.ownership(),
          ),
        )
        .returning();
      if (!task) return null;
      if (this.workspaceId && !mutation.suppressDomainEvent) {
        await new LinearSyncModel(runner, this.workspaceId).recordTaskChangeInTransaction(runner, {
          changedFields: ['status'],
          eventId: mutation.eventId,
          eventType: 'task.status.changed',
          idempotencyKey:
            mutation.idempotencyKey ??
            `task:${task.id}:revision:${task.domainRevision}:task.status.changed`,
          source: mutation.source ?? 'system',
          suppressLinearOutbox: mutation.suppressLinearOutbox,
          task,
        });
      }
      return task;
    });
  }

  async batchUpdateStatus(ids: string[], status: string): Promise<number> {
    if (ids.length === 0) return 0;
    if (!this.dependencyLockHeld) {
      return this.withDependencyLock((model) => model.batchUpdateStatus(ids, status));
    }
    return (await this.updateStatusForIds(ids, status)).length;
  }

  /**
   * Update a frozen set of task ids in one SQL statement so the family cannot
   * be left partially transitioned. Callers pass the exact ids they snapshotted
   * (and the user confirmed); a task that changes status concurrently is never
   * pulled into the update by a status re-query.
   */
  async updateStatusForIds(
    ids: string[],
    status: string,
    extra?: {
      completedAt?: Date;
      error?: string | null;
      runReservationExpiresAt?: Date | null;
      runReservationId?: string | null;
      startedAt?: Date;
    },
    mutation: TaskMutationContext = {},
  ): Promise<TaskItem[]> {
    if (ids.length === 0) return [];
    if (!this.dependencyLockHeld) {
      return this.withDependencyLock((model) =>
        model.updateStatusForIds(ids, status, extra, mutation),
      );
    }
    await this.assertDependenciesForStatus(ids, status);
    const updated = await this.db
      .update(tasks)
      .set({
        status,
        updatedAt: new Date(),
        ...extra,
        ...TaskModel.reviewerBackfillSet(status),
        domainRevision: sql`${tasks.domainRevision} + 1`,
      })
      .where(and(inArray(tasks.id, ids), this.ownership()))
      .returning();
    if (this.workspaceId && !mutation.suppressDomainEvent) {
      const model = new LinearSyncModel(this.db, this.workspaceId);
      for (const task of updated) {
        await model.recordTaskChangeInTransaction(this.db, {
          changedFields: ['status'],
          eventId: mutation.eventId,
          eventType: 'task.status.changed',
          idempotencyKey:
            mutation.idempotencyKey === undefined
              ? `task:${task.id}:revision:${task.domainRevision}:task.status.changed`
              : `${mutation.idempotencyKey}:${task.id}`,
          source: mutation.source ?? 'system',
          suppressLinearOutbox: mutation.suppressLinearOutbox,
          task,
        });
      }
    }
    return updated;
  }

  // ========== Config ==========

  /**
   * Safely merge-update the task's config object.
   * Reads the current config, shallow-merges the incoming partial, and writes back.
   */
  async updateTaskConfig(
    id: string,
    partial: Record<string, unknown>,
    options: { invalidateRun?: boolean } = {},
  ): Promise<TaskItem | null> {
    const task = await this.findById(id);
    if (!task) return null;

    const current = (task.config as Record<string, unknown>) || {};
    const config = merge(current, partial);
    return this.update(id, {
      config,
      ...(options.invalidateRun
        ? { runReservationExpiresAt: null, runReservationId: null }
        : undefined),
    });
  }

  // ========== Context (runtime state) ==========

  /**
   * Atomically claim the short task-run kickoff window. The claim only spans
   * stale-run recovery, workspace provisioning, and agent dispatch; once the
   * new task_topics row exists, that row is the durable in-flight guard.
   */
  async claimRunKickoff(id: string, token: string, staleBefore: Date): Promise<boolean> {
    const claim = JSON.stringify({ claimedAt: new Date().toISOString(), token });
    const claimed = await this.db
      .update(tasks)
      .set({
        context: sql`jsonb_set(coalesce(${tasks.context}, '{}'::jsonb), '{runKickoffClaim}', ${claim}::jsonb, true)`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tasks.id, id),
          this.ownership(),
          or(
            sql`not coalesce(jsonb_exists(${tasks.context}, 'runKickoffClaim'), false)`,
            sql`coalesce((${tasks.context}->'runKickoffClaim'->>'claimedAt')::timestamptz, '-infinity'::timestamptz) < ${staleBefore}`,
          ),
        ),
      )
      .returning({ id: tasks.id });
    return claimed.length > 0;
  }

  /** Release a kickoff claim only when it is still owned by this invocation. */
  async releaseRunKickoff(id: string, token: string): Promise<void> {
    await this.db
      .update(tasks)
      .set({ context: sql`coalesce(${tasks.context}, '{}'::jsonb) - 'runKickoffClaim'` })
      .where(
        and(
          eq(tasks.id, id),
          this.ownership(),
          sql`${tasks.context}->'runKickoffClaim'->>'token' = ${token}`,
        ),
      );
  }

  /**
   * Deep-merge into the task's context JSONB. Used by the heartbeat scheduler
   * to update `context.scheduler.{tickMessageId, consecutiveFailures, ...}`
   * without disturbing other namespaces under context.
   */
  async updateContext(id: string, partial: Record<string, unknown>): Promise<TaskItem | null> {
    const task = await this.findById(id);
    if (!task) return null;

    const current = (task.context as Record<string, unknown>) || {};
    const context = merge(current, partial);
    return this.update(id, { context });
  }

  /** Commit a deferred heartbeat only if its original tick and schedule still own it. */
  async updateContextIfHeartbeatTick(
    id: string,
    tickToken: string | undefined,
    interval: number,
    scheduler: { scheduledAt: string; tickMessageId: string; tickToken: string },
  ): Promise<boolean> {
    const updated = await this.db
      .update(tasks)
      .set({
        context: sql`jsonb_set(coalesce(${tasks.context}, '{}'::jsonb), '{scheduler}',
        coalesce(${tasks.context}->'scheduler', '{}'::jsonb) || ${JSON.stringify(scheduler)}::jsonb)`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tasks.id, id),
          this.ownership(),
          eq(tasks.status, 'scheduled'),
          eq(tasks.automationMode, 'heartbeat'),
          eq(tasks.heartbeatInterval, interval),
          sql`${tasks.context} #>> '{scheduler,tickToken}' IS NOT DISTINCT FROM ${tickToken ?? null}`,
        ),
      )
      .returning({ id: tasks.id });
    return updated.length > 0;
  }

  // ========== Checkpoint ==========

  getCheckpointConfig(task: TaskItem): CheckpointConfig {
    return (task.config as Record<string, any>)?.checkpoint || {};
  }

  async updateCheckpointConfig(
    id: string,
    checkpoint: CheckpointConfig,
    options?: { invalidateRun?: boolean },
  ): Promise<TaskItem | null> {
    return this.updateTaskConfig(id, { checkpoint }, options);
  }

  // ========== Review Config ==========

  getReviewConfig(task: TaskItem): Record<string, any> | undefined {
    return (task.config as Record<string, any>)?.review;
  }

  async updateReviewConfig(
    id: string,
    review: Record<string, any>,
    options?: { invalidateRun?: boolean },
  ): Promise<TaskItem | null> {
    return this.updateTaskConfig(id, { review }, options);
  }

  // ========== Verify Config ==========

  /**
   * Read this task's own verify config from `config.verify`. During the
   * migration window it falls back to the legacy `config.review` key so tasks
   * configured before the verify cutover still surface their gate settings —
   * only the shared `enabled` / `maxIterations` fields carry over (review's
   * inline rubrics are dropped, no data was using them).
   */
  getVerifyConfig(task: TaskItem): TaskVerifyConfig | undefined {
    const config = task.config as Record<string, any> | undefined;
    if (config?.verify) return config.verify as TaskVerifyConfig;

    const review = config?.review as Record<string, any> | undefined;
    if (review && (review.enabled !== undefined || review.maxIterations !== undefined)) {
      return { enabled: review.enabled, maxIterations: review.maxIterations };
    }
    return undefined;
  }

  /**
   * Resolve the effective verify config for a task, honoring subtask
   * inheritance. Whole-config override semantics: the task uses its own config
   * when it has one, otherwise it walks up `parentTaskId` and adopts the
   * nearest ancestor's config in full (never a field-level merge of the two).
   * Returns `undefined` when no task in the chain has a verify config.
   */
  async resolveVerifyConfig(taskId: string): Promise<TaskVerifyConfig | undefined> {
    const seen = new Set<string>();
    let currentId: string | null = taskId;

    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const task = await this.findById(currentId);
      if (!task) break;

      const config = this.getVerifyConfig(task);
      if (config) return config;

      currentId = task.parentTaskId;
    }
    return undefined;
  }

  /**
   * Patch the task's own `config.verify`. Per-key semantics (a plain deep-merge
   * can't express "remove", and JSON can't transmit `undefined`):
   * - `null`      → clear the key (e.g. switch a rubric/verifier back to default)
   * - omitted     → leave the existing value untouched
   * - any value   → set it (arrays replace wholesale, not index-merged)
   *
   * The merge is scoped to the `verify` sub-object so sibling config keys
   * (model, checkpoint, schedule, …) are preserved.
   */
  async updateVerifyConfig(
    id: string,
    patch: { [K in keyof TaskVerifyConfig]?: TaskVerifyConfig[K] | null },
  ): Promise<TaskItem | null> {
    const task = await this.findById(id);
    if (!task) return null;

    const config = (task.config as Record<string, any>) || {};
    const next: Record<string, any> = { ...(config.verify as TaskVerifyConfig | undefined) };

    for (const [key, value] of Object.entries(patch)) {
      if (value === null) delete next[key];
      else if (value !== undefined) next[key] = value;
    }

    return this.update(id, { config: { ...config, verify: next } });
  }

  // Check if a task should pause after a topic completes
  // Default: pause (when no checkpoint config is set)
  // Explicit: pause only if topic.after is true
  shouldPauseOnTopicComplete(task: TaskItem): boolean {
    const checkpoint = this.getCheckpointConfig(task);
    const hasAnyConfig = Object.keys(checkpoint).length > 0;
    return hasAnyConfig ? !!checkpoint.topic?.after : true;
  }

  // Check if a task should be paused before starting (parent's tasks.beforeIds)
  shouldPauseBeforeStart(parentTask: TaskItem, childIdentifier: string): boolean {
    const checkpoint = this.getCheckpointConfig(parentTask);
    return checkpoint.tasks?.beforeIds?.includes(childIdentifier) ?? false;
  }

  // Check if a task should be paused after completing (parent's tasks.afterIds)
  shouldPauseAfterComplete(parentTask: TaskItem, childIdentifier: string): boolean {
    const checkpoint = this.getCheckpointConfig(parentTask);
    return checkpoint.tasks?.afterIds?.includes(childIdentifier) ?? false;
  }

  // ========== Heartbeat ==========

  async updateHeartbeat(id: string): Promise<void> {
    await this.db
      .update(tasks)
      .set({ lastHeartbeatAt: new Date(), updatedAt: new Date() })
      .where(and(eq(tasks.id, id), this.ownership()));
  }

  /**
   * Touch a callback only while it still belongs to the task's active topic.
   * `NULL` is accepted for legacy tasks created before currentTopicId was
   * recorded; once a task has a generation, an older topic cannot claim it.
   */
  async updateHeartbeatIfCurrentTopic(id: string, topicId: string): Promise<boolean> {
    const updated = await this.db
      .update(tasks)
      .set({ lastHeartbeatAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(tasks.id, id),
          or(isNull(tasks.currentTopicId), eq(tasks.currentTopicId, topicId)),
          this.ownership(),
        ),
      )
      .returning({ id: tasks.id });

    return updated.length > 0;
  }

  // Tasks eligible for cron-based dispatch.
  // Excludes terminal/paused/running — `paused` requires user attention,
  // `running` is already in flight (and `runTask` would CONFLICT anyway).
  static async getScheduledTasks(db: OrviloDatabase): Promise<TaskItem[]> {
    return db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.automationMode, 'schedule'),
          isNotNull(tasks.schedulePattern),
          notInArray(tasks.status, ['canceled', 'completed', 'failed', 'paused', 'running']),
        ),
      );
  }

  // Find stuck tasks (running but heartbeat timed out)
  // Only checks tasks that have both lastHeartbeatAt and heartbeatTimeout set.
  // A completion callback owns a long-lived lease while verify/settlement
  // side effects are running; its heartbeat is deliberately not treated as a
  // dead generation. API callers may additionally restrict the sweep to one
  // task creator and workspace.
  static async findStuckTasks(
    db: OrviloDatabase,
    options: { createdByUserId?: string; workspaceId?: string } = {},
  ): Promise<TaskItem[]> {
    return db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, 'running'),
          options.createdByUserId ? eq(tasks.createdByUserId, options.createdByUserId) : undefined,
          options.workspaceId ? eq(tasks.workspaceId, options.workspaceId) : undefined,
          options.createdByUserId && !options.workspaceId ? isNull(tasks.workspaceId) : undefined,
          isNotNull(tasks.lastHeartbeatAt),
          isNotNull(tasks.heartbeatTimeout),
          sql`${tasks.lastHeartbeatAt} < now() - make_interval(secs => ${tasks.heartbeatTimeout})`,
          sql`NOT (coalesce(${tasks.runReservationId}, '') LIKE 'completion:%' AND ${tasks.runReservationExpiresAt} > now())`,
        ),
      );
  }

  // ========== Dependencies ==========

  // Authorize through the dependent, not the member who originally added the
  // edge. This also repairs reads of legacy edges after public -> private.
  private depsOwnership = () => sql`exists (
    select 1 from tasks dependency_owner
    where dependency_owner.id = ${taskDependencies.taskId}
      and ${this.ownershipSql('dependency_owner')}
  )`;

  // Ordinary relations are symmetric: either readable endpoint may inspect
  // and remove the edge, while the unreadable peer stays redacted by the task
  // detail projection. Blocking dependencies remain authorized only through
  // their dependent task.
  private issueRelationOwnership = () =>
    or(
      this.depsOwnership(),
      and(
        eq(taskDependencies.type, 'relates'),
        sql`exists (
          select 1 from tasks relation_target
          where relation_target.id = ${taskDependencies.dependsOnId}
            and ${this.ownershipSql('relation_target')}
        )`,
      ),
    )!;

  /** Only used by the demotion cascade in {@link updateVisibility} — regular
   *  taskTopics reads/writes live in `TaskTopicModel`. */
  private topicsOwnership = () =>
    this.childOwnership({
      userId: taskTopics.userId,
      visibility: taskTopics.visibility,
      workspaceId: taskTopics.workspaceId,
    });

  async addDependency(
    taskId: string,
    dependsOnId: string,
    type: string = 'blocks',
    mutation: TaskMutationContext = {},
  ): Promise<void> {
    if (!this.dependencyLockHeld) {
      return this.withDependencyLock((model) =>
        model.addDependency(taskId, dependsOnId, type, mutation),
      );
    }
    if (taskId === dependsOnId) throw new TaskDependencyError('A task cannot depend on itself.');
    if (type !== 'blocks' && type !== 'relates')
      throw new TaskDependencyError('Invalid dependency type.');
    const dependencyTasks = await this.findByIds([taskId, dependsOnId]);
    const task = dependencyTasks.find(({ id }) => id === taskId);
    const dependsOn = dependencyTasks.find(({ id }) => id === dependsOnId);
    if (
      !task ||
      !dependsOn ||
      task.deletedAt ||
      task.isDeleted ||
      dependsOn.deletedAt ||
      dependsOn.isDeleted
    ) {
      throw new TaskDependencyError('Task not found or unavailable.');
    }
    if (task.projectId !== dependsOn.projectId && (task.projectId || dependsOn.projectId)) {
      throw new TaskDependencyError('Task dependencies cannot cross project boundaries.');
    }

    const existing = (await this.getDependencies(taskId)).find(
      (dep) => dep.dependsOnId === dependsOnId,
    );
    if (existing?.type === type) return;
    if (existing?.type === 'blocks' && type === 'relates') {
      throw new TaskDependencyError('A blocking relationship already exists for this issue pair.');
    }
    if (type === 'relates') {
      // An ordinary relation is symmetric even though the legacy table stores
      // directed rows. Reuse either existing orientation instead of creating a
      // second row with the same Linear relation key.
      const [reverse] = await this.db
        .select({ type: taskDependencies.type })
        .from(taskDependencies)
        .where(
          and(
            eq(taskDependencies.taskId, dependsOnId),
            eq(taskDependencies.dependsOnId, taskId),
            this.depsOwnership(),
          ),
        )
        .limit(1);
      if (reverse?.type === 'relates') return;
    }
    if (type === 'blocks') {
      // UNION (not UNION ALL) terminates even on a corrupt legacy graph. The
      // graph walk is scope-wide, including hidden intermediate nodes, but its
      // only observable output is a generic cycle rejection.
      const scope = this.workspaceId
        ? sql`d.workspace_id = ${this.workspaceId}`
        : sql`d.workspace_id IS NULL AND d.user_id = ${this.userId}`;
      const cycle = await this.db.execute(sql`
        WITH RECURSIVE upstream(id) AS (
          SELECT ${dependsOnId}::text
          UNION
          SELECT d.depends_on_id FROM task_dependencies d
          JOIN upstream u ON d.task_id = u.id
          WHERE d.type = 'blocks' AND ${scope}
        ) SELECT id FROM upstream WHERE id = ${taskId} LIMIT 1
      `);
      if (cycle.rows.length > 0)
        throw new TaskDependencyError('This dependency would create a cycle.');
      if (['running', 'completed'].includes(task.status) && dependsOn.status !== 'completed') {
        throw new TaskDependencyError(
          'Pause or reopen this task before adding an unfinished prerequisite.',
          'PRECONDITION_FAILED',
        );
      }
    }
    const visibility = task.visibility;
    await this.db
      .insert(taskDependencies)
      .values({
        dependsOnId,
        taskId,
        type,
        userId: this.managedSubject ? null : task.createdByUserId,
        visibility,
        workspaceId: this.workspaceId ?? null,
      })
      .onConflictDoUpdate({
        set: {
          type,
          userId: this.managedSubject ? null : task.createdByUserId,
          visibility: task.visibility,
        },
        target: [taskDependencies.taskId, taskDependencies.dependsOnId],
      });

    const [updated] = await this.db
      .update(tasks)
      .set({
        domainRevision: sql`${tasks.domainRevision} + 1`,
        requirementRevision: sql`${tasks.requirementRevision} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, taskId), this.ownership()))
      .returning();
    if (!updated) throw new TaskDependencyError('Task not found or unavailable.');
    if (this.workspaceId && !mutation.suppressDomainEvent) {
      await new LinearSyncModel(this.db, this.workspaceId).recordTaskChangeInTransaction(this.db, {
        changedFields: ['dependencies'],
        eventId: mutation.eventId,
        eventType: 'task.dependency.changed',
        idempotencyKey:
          mutation.idempotencyKey ??
          `task:${updated.id}:revision:${updated.domainRevision}:dependency:add:${dependsOnId}`,
        source: mutation.source ?? 'system',
        outboxPayload: {
          action: 'upsert',
          kind: 'relation',
          relation: {
            kind: type === 'relates' ? 'relates' : 'blocks',
            localRelationKey:
              type === 'relates'
                ? relationKey('relates', taskId, dependsOnId)
                : relationKey('blocks', dependsOnId, taskId),
            sourceTaskId: type === 'relates' ? taskId : dependsOnId,
            targetTaskId: type === 'relates' ? dependsOnId : taskId,
          },
        } satisfies LinearExternalRelationOutboxPayload,
        suppressLinearOutbox: mutation.suppressLinearOutbox,
        task: updated,
      });
    }
  }

  async removeDependency(
    taskId: string,
    dependsOnId: string,
    mutation: TaskMutationContext = {},
    type?: 'blocks' | 'relates',
  ): Promise<void> {
    if (!this.dependencyLockHeld) {
      return this.withDependencyLock((model) =>
        model.removeDependency(taskId, dependsOnId, mutation, type),
      );
    }
    const currentTask = await this.findById(taskId);
    if (!currentTask) throw new TaskDependencyError('Task not found.');
    const deleted = await this.db
      .delete(taskDependencies)
      .where(
        and(
          type === 'relates'
            ? or(
                and(
                  eq(taskDependencies.taskId, taskId),
                  eq(taskDependencies.dependsOnId, dependsOnId),
                ),
                and(
                  eq(taskDependencies.taskId, dependsOnId),
                  eq(taskDependencies.dependsOnId, taskId),
                ),
              )
            : and(
                eq(taskDependencies.taskId, taskId),
                eq(taskDependencies.dependsOnId, dependsOnId),
              ),
          type ? eq(taskDependencies.type, type) : undefined,
          type === 'relates' ? this.issueRelationOwnership() : this.depsOwnership(),
        ),
      )
      .returning({
        dependsOnId: taskDependencies.dependsOnId,
        taskId: taskDependencies.taskId,
        type: taskDependencies.type,
      });
    if (deleted.length === 0) return;

    const syncModel = this.workspaceId ? new LinearSyncModel(this.db, this.workspaceId) : null;
    const syncSourceId =
      type === 'relates'
        ? (
            await syncModel?.findExternalRelationByLocalKey(
              relationKey('relates', taskId, dependsOnId),
            )
          )?.localSourceTaskId
        : null;
    const relationSourceId =
      type === 'relates'
        ? (deleted.find((row) => row.taskId === syncSourceId)?.taskId ??
          deleted[0]?.taskId ??
          taskId)
        : taskId;
    const relationTargetId = relationSourceId === taskId ? dependsOnId : taskId;
    let eventTaskId = relationSourceId;
    if (type === 'relates') {
      const sourceTask =
        relationSourceId === taskId ? currentTask : await this.findById(relationSourceId);
      const targetTask =
        relationTargetId === taskId ? currentTask : await this.findById(relationTargetId);
      if (
        syncModel &&
        !mutation.suppressDomainEvent &&
        !mutation.suppressLinearOutbox &&
        mutation.source !== 'linear'
      ) {
        const [sourceLink, targetLink] = await Promise.all([
          syncModel.findIssueLinkByTaskId(relationSourceId),
          syncModel.findIssueLinkByTaskId(relationTargetId),
        ]);
        eventTaskId =
          sourceLink && sourceTask
            ? relationSourceId
            : targetLink && targetTask
              ? relationTargetId
              : sourceTask
                ? relationSourceId
                : taskId;
      } else if (!sourceTask) {
        eventTaskId = taskId;
      }
    }

    const [updated] = await this.db
      .update(tasks)
      .set({
        domainRevision: sql`${tasks.domainRevision} + 1`,
        requirementRevision: sql`${tasks.requirementRevision} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, eventTaskId), this.ownership()))
      .returning();
    if (!updated) throw new TaskDependencyError('Task not found.');
    if (syncModel && !mutation.suppressDomainEvent) {
      await syncModel.recordTaskChangeInTransaction(this.db, {
        changedFields: ['dependencies'],
        eventId: mutation.eventId,
        eventType: 'task.dependency.changed',
        idempotencyKey:
          mutation.idempotencyKey ??
          `task:${updated.id}:revision:${updated.domainRevision}:dependency:remove:${relationSourceId}:${relationTargetId}`,
        source: mutation.source ?? 'system',
        outboxPayload: {
          action: 'remove',
          kind: 'relation',
          relation: {
            kind: deleted[0]?.type === 'relates' ? 'relates' : 'blocks',
            localRelationKey:
              deleted[0]?.type === 'relates'
                ? relationKey('relates', relationSourceId, relationTargetId)
                : relationKey('blocks', dependsOnId, taskId),
            sourceTaskId: deleted[0]?.type === 'relates' ? relationSourceId : dependsOnId,
            targetTaskId: deleted[0]?.type === 'relates' ? relationTargetId : taskId,
          },
        } satisfies LinearExternalRelationOutboxPayload,
        suppressLinearOutbox: mutation.suppressLinearOutbox,
        task: updated,
      });
    }
  }

  /** Remove one visible relation by its opaque row ID, including its reverse view. */
  async removeDependencyByRelationId(
    taskId: string,
    relationId: string,
    mutation: TaskMutationContext = {},
  ): Promise<void> {
    if (!this.dependencyLockHeld) {
      return this.withDependencyLock((model) =>
        model.removeDependencyByRelationId(taskId, relationId, mutation),
      );
    }
    if (!(await this.findById(taskId))) throw new TaskDependencyError('Task not found.');
    const [relation] = await this.db
      .select()
      .from(taskDependencies)
      .where(and(eq(taskDependencies.id, relationId), this.issueRelationOwnership()))
      .limit(1);
    if (
      !relation ||
      (relation.taskId !== taskId &&
        !(relation.type === 'relates' && relation.dependsOnId === taskId))
    ) {
      throw new TaskDependencyError('Relation not found.');
    }
    const peerId = relation.taskId === taskId ? relation.dependsOnId : relation.taskId;
    await this.removeDependency(
      taskId,
      peerId,
      mutation,
      relation.type === 'relates' ? 'relates' : 'blocks',
    );
  }

  async getDependencies(taskId: string) {
    if (!(await this.findById(taskId))) return [];
    return this.db
      .select()
      .from(taskDependencies)
      .where(and(eq(taskDependencies.taskId, taskId), this.depsOwnership()));
  }

  /** The issue rail adds symmetric ordinary relations to outgoing blockers. */
  async getIssueRelations(taskId: string) {
    if (!(await this.findById(taskId))) return [];
    const [outgoing, incoming] = await Promise.all([
      this.getDependencies(taskId),
      this.db
        .select()
        .from(taskDependencies)
        .where(
          and(
            eq(taskDependencies.dependsOnId, taskId),
            eq(taskDependencies.type, 'relates'),
            this.issueRelationOwnership(),
          ),
        ),
    ]);
    const relatedIds = new Set(
      outgoing.filter((row) => row.type === 'relates').map((row) => row.dependsOnId),
    );
    return [
      ...outgoing,
      ...incoming
        .filter((row) => {
          if (relatedIds.has(row.taskId)) return false;
          relatedIds.add(row.taskId);
          return true;
        })
        .map((row) => ({ ...row, dependsOnId: row.taskId, taskId })),
    ];
  }

  async getDependenciesByTaskIds(taskIds: string[]) {
    if (taskIds.length === 0) return [];
    const readableIds = (await this.findByIds(taskIds)).map((row) => row.id);
    if (readableIds.length === 0) return [];
    return this.db
      .select()
      .from(taskDependencies)
      .where(and(inArray(taskDependencies.taskId, readableIds), this.depsOwnership()));
  }

  async getDependents(taskId: string) {
    if (!(await this.findById(taskId))) return [];
    const rows = await this.db
      .select()
      .from(taskDependencies)
      .where(and(eq(taskDependencies.dependsOnId, taskId), this.depsOwnership()));
    if (rows.length === 0) return [];
    const readableDependents = new Set(
      (await this.findByIds(rows.map((row) => row.taskId))).map((row) => row.id),
    );
    return rows.filter((row) => readableDependents.has(row.taskId));
  }

  /** Missing, trashed, inaccessible, canceled and failed prerequisites all block. */
  async findBlockedTaskIds(taskIds: string[]): Promise<string[]> {
    if (taskIds.length === 0) return [];
    const readableIds = (await this.findByIds(taskIds)).map((row) => row.id);
    if (readableIds.length === 0) return [];
    const blocked = await this.db
      .selectDistinct({ taskId: taskDependencies.taskId })
      .from(taskDependencies)
      .leftJoin(
        tasks,
        and(
          eq(taskDependencies.dependsOnId, tasks.id),
          this.ownership(),
          isNull(tasks.deletedAt),
          sql`${tasks.isDeleted} IS NOT TRUE`,
        ),
      )
      .where(
        and(
          inArray(taskDependencies.taskId, readableIds),
          eq(taskDependencies.type, 'blocks'),
          or(isNull(tasks.id), ne(tasks.status, 'completed')),
          this.depsOwnership(),
        ),
      );
    return blocked.map(({ taskId }) => taskId);
  }

  async areAllDependenciesCompleted(taskId: string): Promise<boolean> {
    if (!(await this.findById(taskId))) return false;
    if (this.workspaceId) {
      const unresolvedExternal = await this.db.execute(sql`
        SELECT 1
        FROM linear_external_relations
        WHERE workspace_id = ${this.workspaceId}
          AND local_target_task_id = ${taskId}
          AND kind = 'blocks'
          AND resolution_state = 'unresolved'
          AND tombstone IS NULL
        LIMIT 1
      `);
      if (unresolvedExternal.rows.length > 0) return false;
    }
    return (await this.findBlockedTaskIds([taskId])).length === 0;
  }

  // Find tasks that are now unblocked after a dependency settles.
  async getUnlockedTasks(settledTaskId: string): Promise<TaskItem[]> {
    return this.getUnlockedTasksForMany([settledTaskId]);
  }

  /**
   * Batched variant of {@link getUnlockedTasks}: discover every task unblocked
   * by any of `settledTaskIds`, batching readiness checks per dependent owner
   * instead of walking the graph once per settled task.
   */
  async getUnlockedTasksForMany(settledTaskIds: string[]): Promise<TaskItem[]> {
    if (settledTaskIds.length === 0) return [];

    // All tasks that depend on any of the completed tasks
    const dependents = await this.db
      .select({ taskId: taskDependencies.taskId })
      .from(taskDependencies)
      .where(
        and(
          inArray(taskDependencies.dependsOnId, settledTaskIds),
          eq(taskDependencies.type, 'blocks'),
          this.depsOwnership(),
        ),
      );
    const dependentIds = [...new Set(dependents.map(({ taskId }) => taskId))];
    if (dependentIds.length === 0) return [];

    // Discovery remains caller-visible. Evaluate each candidate in its owner's
    // scope: the last completing member need not see every private prerequisite.
    const candidates = await this.db
      .select()
      .from(tasks)
      .where(and(inArray(tasks.id, dependentIds), eq(tasks.status, 'backlog'), this.ownership()));
    const byOwner = new Map<string, string[]>();
    for (const task of candidates) {
      const ownerId = task.createdByUserId ?? task.createdBySubjectId;
      if (!ownerId) continue;
      const ids = byOwner.get(ownerId) ?? [];
      ids.push(task.id);
      byOwner.set(ownerId, ids);
    }
    const blockedIds = new Set(
      (
        await Promise.all(
          [...byOwner].map(([ownerId, ids]) =>
            new TaskModel(this.db, ownerId, this.workspaceId).findBlockedTaskIds(ids),
          ),
        )
      ).flat(),
    );
    return candidates.filter(({ id }) => !blockedIds.has(id));
  }

  // Check if all subtasks of a parent task are completed
  async areAllSubtasksCompleted(parentTaskId: string): Promise<boolean> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(
        and(eq(tasks.parentTaskId, parentTaskId), ne(tasks.status, 'completed'), this.ownership()),
      );

    return Number(result[0].count) === 0;
  }

  // ========== Documents (MVP Workspace) ==========

  private docsOwnership = () =>
    this.childOwnership({
      userId: taskDocuments.userId,
      visibility: taskDocuments.visibility,
      workspaceId: taskDocuments.workspaceId,
    });

  async pinDocument(taskId: string, documentId: string, pinnedBy: string = 'agent'): Promise<void> {
    const visibility = await this.getTaskVisibility(taskId);
    await this.db
      .insert(taskDocuments)
      .values({
        documentId,
        pinnedBy,
        taskId,
        userId: this.userId,
        visibility,
        workspaceId: this.workspaceId ?? null,
      })
      .onConflictDoNothing();
  }

  async unpinDocument(taskId: string, documentId: string): Promise<void> {
    await this.db
      .delete(taskDocuments)
      .where(
        and(
          eq(taskDocuments.taskId, taskId),
          eq(taskDocuments.documentId, documentId),
          this.docsOwnership(),
        ),
      );
  }

  async getPinnedDocuments(taskId: string) {
    return this.db
      .select()
      .from(taskDocuments)
      .where(and(eq(taskDocuments.taskId, taskId), this.docsOwnership()))
      .orderBy(taskDocuments.createdAt);
  }

  /**
   * Documents pinned to a task at or after a given timestamp, joined with the
   * `documents` table so callers receive `{ id, kind, title }` directly.
   *
   * Used by topic-brief synthesis to attribute artifacts to the topic that
   * just completed: pass the topic's start time as `since`.
   */
  async getDocumentsPinnedSince(
    taskId: string,
    since: Date,
  ): Promise<{ id: string; kind: string | null; title: string | null }[]> {
    const rows = await this.db
      .select({
        fileType: documents.fileType,
        id: documents.id,
        title: documents.title,
      })
      .from(taskDocuments)
      // Guard the referenced document too: the junction's visibility column is
      // a write-time mirror of the TASK, so a document independently switched
      // back to private would otherwise still leak its title here.
      .innerJoin(
        documents,
        and(
          eq(taskDocuments.documentId, documents.id),
          buildWorkspaceWhere({ userId: this.userId, workspaceId: this.workspaceId }, documents),
        ),
      )
      .where(
        and(
          eq(taskDocuments.taskId, taskId),
          this.docsOwnership(),
          gte(taskDocuments.createdAt, since),
        ),
      );

    return rows.map((row) => ({
      id: row.id,
      kind: row.fileType ?? null,
      title: row.title ?? null,
    }));
  }

  // Get all pinned docs from a task tree (recursive), returns nodeMap + tree structure
  async getTreePinnedDocuments(rootTaskId: string): Promise<WorkspaceData> {
    const rootOwnership = this.ownershipSql();
    const recursiveOwnership = this.ownershipSql('t');
    const docsOwnership = this.workspaceId
      ? sql`td.workspace_id = ${this.workspaceId}
            AND (td.visibility = 'public' OR td.user_id = ${this.userId})`
      : sql`td.user_id = ${this.userId} AND td.workspace_id IS NULL`;
    // Guard the referenced document row itself: `td.visibility` is a
    // write-time mirror of the TASK's visibility, so a document independently
    // switched back to private would otherwise still leak its title/metadata
    // through this join. A guarded-out document keeps its junction row but
    // joins as NULL → surfaced as an inaccessible tombstone node.
    const documentVisibility = this.workspaceId
      ? sql`d.workspace_id = ${this.workspaceId}
            AND (d.visibility IS NULL OR d.visibility = 'public' OR d.user_id = ${this.userId})`
      : sql`d.user_id = ${this.userId} AND d.workspace_id IS NULL`;
    const result = await this.db.execute(sql`
      WITH RECURSIVE task_tree AS (
        SELECT id, identifier FROM tasks WHERE id = ${rootTaskId} AND ${rootOwnership}
        UNION ALL
        SELECT t.id, t.identifier FROM tasks t
        JOIN task_tree tt ON t.parent_task_id = tt.id
        WHERE ${recursiveOwnership}
      )
      SELECT td.*, tt.id as source_task_id, tt.identifier as source_task_identifier,
             d.id as document_ref_id,
             d.title as document_title, d.file_type as document_file_type, d.parent_id as document_parent_id,
             d.total_char_count as document_char_count, d.updated_at as document_updated_at,
             w.origin_topic_id as source_topic_id, wt.title as source_topic_title
      FROM task_documents td
      JOIN task_tree tt ON td.task_id = tt.id
      LEFT JOIN documents d ON td.document_id = d.id AND ${documentVisibility}
      -- The run that produced the document, read off the Work it registered: a
      -- document Work keys its resource by the document id, and (resourceType,
      -- resourceId, userId) is unique, so this cannot duplicate a document row.
      -- A hand-pinned document has no Work and joins as NULL.
      -- No backticks in these comments: they would close the template literal.
      LEFT JOIN works w ON w.resource_id = td.document_id
                       AND w.type = 'document'
                       AND w.user_id = ${this.userId}
      LEFT JOIN topics wt ON wt.id = w.origin_topic_id
      WHERE ${docsOwnership}
      ORDER BY td.created_at
    `);

    // Build nodeMap
    const nodeMap: Record<string, WorkspaceDocNode> = {};

    const docIds = new Set<string>();

    for (const row of result.rows as any[]) {
      const docId = row.document_id;
      // Join miss = the viewer lost access to the document (switched back to
      // private) or it was deleted. Emit a titleless tombstone so the UI can
      // render a no-access placeholder instead of leaking the title.
      const inaccessible = row.document_ref_id === null;
      docIds.add(docId);
      nodeMap[docId] = {
        charCount: inaccessible ? null : row.document_char_count,
        createdAt: row.created_at,
        fileType: inaccessible ? '' : row.document_file_type,
        inaccessible: inaccessible || undefined,
        parentId: inaccessible ? null : row.document_parent_id,
        pinnedBy: row.pinned_by,
        sourceTaskId: row.source_task_id,
        sourceTaskIdentifier: row.source_task_id !== rootTaskId ? row.source_task_identifier : null,
        sourceTopicId: row.source_topic_id ?? null,
        sourceTopicTitle: row.source_topic_title ?? null,
        title: inaccessible ? '' : row.document_title || 'Untitled',
        updatedAt: inaccessible ? null : row.document_updated_at,
      };
    }

    // Build tree (children as id references)
    type TreeNode = WorkspaceTreeNode;

    const childrenMap = new Map<string | null, TreeNode[]>();
    for (const docId of docIds) {
      const node = nodeMap[docId];
      const parentId = node.parentId && docIds.has(node.parentId) ? node.parentId : null;
      const list = childrenMap.get(parentId) || [];
      list.push({ children: [], id: docId });
      childrenMap.set(parentId, list);
    }

    const buildTree = (parentId: string | null): TreeNode[] => {
      const nodes = childrenMap.get(parentId) || [];
      for (const node of nodes) {
        node.children = buildTree(node.id);
      }
      return nodes;
    };

    return { nodeMap, tree: buildTree(null) };
  }

  // ========== Topic Management ==========

  async incrementTopicCount(id: string): Promise<void> {
    await this.db
      .update(tasks)
      .set({
        totalTopics: sql`${tasks.totalTopics} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, id), this.ownership()));
  }

  async updateCurrentTopic(id: string, topicId: string): Promise<void> {
    await this.db
      .update(tasks)
      .set({ currentTopicId: topicId, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), this.ownership()));
  }

  // ========== Comments ==========

  private commentsOwnership = () =>
    this.childOwnership({
      userId: taskComments.userId,
      visibility: taskComments.visibility,
      workspaceId: taskComments.workspaceId,
    });

  private async recordCommentMutation(
    runner: OrviloDatabase,
    input: {
      action: 'created' | 'deleted' | 'updated';
      comment?: { content: string; editorData?: unknown } | null;
      commentId: string;
      externalMappingId?: string;
      mutation?: TaskMutationContext;
      source: TaskDomainEventSource;
      taskId: string;
    },
  ) {
    const [task] = await runner
      .update(tasks)
      .set({
        domainRevision: sql`${tasks.domainRevision} + 1`,
        requirementRevision: sql`${tasks.requirementRevision} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, input.taskId), this.ownership()))
      .returning();
    if (!task) throw new Error('Task not found');
    if (!this.workspaceId || input.mutation?.suppressDomainEvent) return task;

    await new LinearSyncModel(runner, this.workspaceId).recordTaskChangeInTransaction(runner, {
      changedFields: ['comments'],
      eventId: input.mutation?.eventId,
      eventType: 'task.comment.changed',
      externalMappingId: input.externalMappingId,
      idempotencyKey:
        input.mutation?.idempotencyKey ??
        `task:${task.id}:revision:${task.domainRevision}:comment:${input.action}:${input.commentId}`,
      payload: { action: input.action, commentId: input.commentId },
      source: input.mutation?.source ?? input.source,
      outboxPayload:
        input.action === 'deleted'
          ? { action: 'delete', commentId: input.commentId, kind: 'comment' }
          : input.comment
            ? ({
                action: input.action === 'created' ? 'create' : 'update',
                body: input.comment.content,
                commentId: input.commentId,
                ...(input.comment.editorData !== undefined
                  ? { editorData: input.comment.editorData }
                  : {}),
                kind: 'comment',
              } satisfies LinearExternalCommentOutboxPayload)
            : undefined,
      suppressLinearOutbox: false,
      task,
    });
    return task;
  }

  async addComment(
    data: Omit<NewTaskComment, 'id'>,
    mutation: TaskMutationContext = {},
  ): Promise<TaskCommentItem> {
    // Mirror the parent task's visibility onto the comment so subsequent
    // reads/writes can be filtered without a JOIN. Falls back to 'public'
    // if the task is somehow not visible (defensive — the caller should
    // already have validated the task via `resolveOrThrow`).
    return this.db.transaction(async (tx) => {
      const runner = tx as OrviloDatabase;
      const visibility = await new TaskModel(
        runner,
        this.userId,
        this.workspaceId,
      ).getTaskVisibility(data.taskId);
      const [comment] = await runner
        .insert(taskComments)
        .values({ ...data, visibility, workspaceId: this.workspaceId ?? null })
        .returning();
      await this.recordCommentMutation(runner, {
        action: 'created',
        comment,
        commentId: comment.id,
        mutation,
        source: data.authorAgentId ? 'agent' : 'user',
        taskId: data.taskId,
      });
      return comment;
    });
  }

  async findCommentById(id: string): Promise<TaskCommentItem | undefined> {
    const [comment] = await this.db
      .select()
      .from(taskComments)
      .where(and(eq(taskComments.id, id), this.commentsOwnership()))
      .limit(1);
    return comment;
  }

  async getComments(taskId: string): Promise<TaskCommentItem[]> {
    if (!(await this.findById(taskId))) return [];
    return this.db
      .select()
      .from(taskComments)
      .where(and(eq(taskComments.taskId, taskId), this.commentsOwnership()))
      .orderBy(taskComments.createdAt);
  }

  async deleteComment(id: string, mutation: TaskMutationContext = {}): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const runner = tx as OrviloDatabase;
      const externalMapping = this.workspaceId
        ? await new LinearSyncModel(runner, this.workspaceId).findExternalCommentByLocalId(id)
        : null;
      const [comment] = await runner
        .delete(taskComments)
        .where(and(eq(taskComments.id, id), this.commentsOwnership()))
        .returning();
      if (!comment) return false;
      await this.recordCommentMutation(runner, {
        action: 'deleted',
        comment,
        commentId: comment.id,
        externalMappingId: externalMapping?.id,
        mutation,
        source: comment.authorAgentId ? 'agent' : 'user',
        taskId: comment.taskId,
      });
      return true;
    });
  }

  async updateComment(
    id: string,
    content: string,
    opts?: { editorData?: unknown; mutation?: TaskMutationContext },
  ): Promise<TaskCommentItem | undefined> {
    return this.db.transaction(async (tx) => {
      const runner = tx as OrviloDatabase;
      const [comment] = await runner
        .update(taskComments)
        .set({
          content,
          ...(opts?.editorData !== undefined ? { editorData: opts.editorData as never } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(taskComments.id, id), this.commentsOwnership()))
        .returning();
      if (!comment) return undefined;
      await this.recordCommentMutation(runner, {
        action: 'updated',
        comment,
        commentId: comment.id,
        mutation: opts?.mutation,
        source: comment.authorAgentId ? 'agent' : 'user',
        taskId: comment.taskId,
      });
      return comment;
    });
  }

  // ========== Activities ==========

  private activitiesOwnership = () =>
    this.childOwnership({
      userId: taskActivities.userId,
      visibility: taskActivities.visibility,
      workspaceId: taskActivities.workspaceId,
    });

  /**
   * Append one event row. Mirrors the parent task's visibility onto the row so
   * subsequent reads can be filtered without a JOIN — same contract as
   * `addComment`.
   */
  async addActivity(
    data: Omit<NewTaskActivity, 'id' | 'userId' | 'workspaceId' | 'visibility'>,
  ): Promise<TaskActivityItem> {
    const visibility = await this.getTaskVisibility(data.taskId);
    const [activity] = await this.db
      .insert(taskActivities)
      .values({
        ...data,
        userId: this.userId,
        visibility,
        workspaceId: this.workspaceId ?? null,
      })
      .returning();
    return activity;
  }

  /**
   * Append several event rows in one INSERT. Unlike `addActivity`, the caller
   * supplies each row's visibility — meant for a bulk write that has already
   * read (and locked) the tasks it describes.
   */
  async addActivities(
    rows: Omit<NewTaskActivity, 'id' | 'userId' | 'workspaceId'>[],
  ): Promise<TaskActivityItem[]> {
    if (rows.length === 0) return [];
    return this.db
      .insert(taskActivities)
      .values(
        rows.map((row) => ({ ...row, userId: this.userId, workspaceId: this.workspaceId ?? null })),
      )
      .returning();
  }

  /**
   * Lock a set of tasks for the rest of the transaction and return what a
   * bulk status write needs to describe them afterwards: the status each one
   * is leaving and the visibility its activity row inherits. Reading these
   * before the lock would let a concurrent edit slip in between and the log
   * would name a transition that never happened.
   */
  async lockForStatusChange(
    ids: string[],
  ): Promise<{ id: string; status: string; visibility: 'private' | 'public' }[]> {
    if (ids.length === 0) return [];
    await this.lockDependencyGraph();
    return this.db
      .select({ id: tasks.id, status: tasks.status, visibility: tasks.visibility })
      .from(tasks)
      .where(and(inArray(tasks.id, ids), this.ownership()))
      .for('update');
  }

  /**
   * Update a task and append one event per tracked field that actually
   * changed, in ONE transaction, with the previous values taken from a
   * **locked** read of the row.
   *
   * The lock is the point. Reading the "before" value outside the write lets
   * two concurrent edits both observe the same origin — an A→B and an A→C
   * racing on one task persist A→B then B→C while a lock-free recorder logs
   * A→B and A→C, losing the middle state. Rows are inserted next to the write
   * they describe, so their order cannot disagree with the order the updates
   * landed in.
   *
   * Which edits reach the feed is decided by the caller, not here: anything
   * that goes through this method is logged. Person-made changes (the update
   * procedure, the agent `editTask` tool, the status picker) and the runner's
   * inbox fallback come here; the runner / lifecycle / watchdog status
   * transitions use the plain writers, because the run row already tells that
   * story.
   */
  async updateWithLog(
    id: string,
    data: Partial<Omit<NewTask, 'id' | 'identifier' | 'seq' | 'createdByUserId'>>,
    actor: { agentId?: string | null; userId?: string | null },
    mutation: TaskMutationContext = {},
  ): Promise<TaskItem | null> {
    const touched =
      TRACKED_TASK_COLUMNS.some((col) => data[col] !== undefined) ||
      LINEAR_SYNC_TASK_COLUMNS.some((col) => data[col] !== undefined);
    // Nothing to diff against: a field unrelated to task activity or Linear
    // synchronization should not pay for a lock.
    if (!touched) return this.update(id, data, mutation);

    return this.db.transaction(async (tx) => {
      const runner = tx as OrviloDatabase;
      const scoped = new TaskModel(runner, this.userId, this.workspaceId);
      await scoped.lockDependencyGraph();
      scoped.dependencyLockHeld = true;
      const [before] = await runner
        .select({
          assigneeAgentId: tasks.assigneeAgentId,
          assigneeUserId: tasks.assigneeUserId,
          automationMode: tasks.automationMode,
          config: tasks.config,
          heartbeatInterval: tasks.heartbeatInterval,
          priority: tasks.priority,
          reviewerUserId: tasks.reviewerUserId,
          schedulePattern: tasks.schedulePattern,
          scheduleTimezone: tasks.scheduleTimezone,
          status: tasks.status,
        })
        .from(tasks)
        .where(and(eq(tasks.id, id), this.ownership()))
        .for('update')
        .limit(1);
      if (!before) return null;

      const source = actor.agentId ? 'agent' : actor.userId ? 'user' : 'system';
      const updated = await scoped.update(id, data, {
        ...mutation,
        source: mutation.source ?? source,
      });
      if (!updated) return null;

      const events: { payload: TaskActivityLogPayload; type: TaskActivityLogType }[] = [];

      // The two assignee slots are independent — one edit can move both, and
      // each gets its own row so the feed reads one change per line.
      if (before.assigneeAgentId !== updated.assigneeAgentId) {
        events.push({
          payload: { fromId: before.assigneeAgentId, toId: updated.assigneeAgentId },
          type: 'assignee_agent',
        });
      }
      if (before.assigneeUserId !== updated.assigneeUserId) {
        events.push({
          payload: { fromId: before.assigneeUserId, toId: updated.assigneeUserId },
          type: 'assignee_user',
        });
      }
      // Only an explicit reviewer write earns a feed row — the COALESCE
      // backfill stamped on a paused transition is the system's fallback
      // choice, and attributing it to whoever paused would read as their
      // deliberate pick.
      if (data.reviewerUserId !== undefined && before.reviewerUserId !== updated.reviewerUserId) {
        events.push({
          payload: { fromId: before.reviewerUserId, toId: updated.reviewerUserId },
          type: 'reviewer',
        });
      }
      if (before.status !== updated.status) {
        events.push({ payload: { from: before.status, to: updated.status }, type: 'status' });
      }
      if ((before.priority ?? null) !== (updated.priority ?? null)) {
        events.push({
          payload: { from: before.priority ?? null, to: updated.priority ?? null },
          type: 'priority',
        });
      }
      const automationBefore = snapshotAutomation(before);
      const automationAfter = snapshotAutomation(updated);
      if (JSON.stringify(automationBefore) !== JSON.stringify(automationAfter)) {
        events.push({
          payload: { from: automationBefore, to: automationAfter },
          type: 'automation',
        });
      }

      const { actorKind, ...actorColumns } = taskActivityActor(actor);
      for (const event of events) {
        await scoped.addActivity({
          ...actorColumns,
          payload: { ...event.payload, actorKind },
          taskId: id,
          type: event.type,
        });
      }

      return updated;
    });
  }

  /**
   * Oldest-first. `limit` keeps the newest N rows (still returned
   * oldest-first) so a long-lived task does not ship its whole history on
   * every detail poll; the table itself is the full audit trail.
   */
  async getActivities(taskId: string, limit?: number): Promise<TaskActivityItem[]> {
    if (!(await this.findById(taskId))) return [];
    const where = and(eq(taskActivities.taskId, taskId), this.activitiesOwnership());
    if (limit === undefined) {
      return this.db.select().from(taskActivities).where(where).orderBy(taskActivities.createdAt);
    }
    const newest = await this.db
      .select()
      .from(taskActivities)
      .where(where)
      .orderBy(desc(taskActivities.createdAt), desc(taskActivities.id))
      .limit(limit);
    return newest.reverse();
  }

  /**
   * Newest-first project-scoped feed: every activity row whose parent task
   * belongs to the project and is readable by the caller right now. The
   * parent row goes through the full `ownership()` predicate (workspace +
   * task visibility + private-team readability) — the activity row's
   * mirrored visibility alone cannot prove the viewer is still allowed to
   * see a task whose team's ACL changed since the row was written.
   */
  async getProjectActivities(
    projectId: string,
    limit = 50,
    cursorId?: string,
  ): Promise<{
    items: {
      activity: TaskActivityItem;
      taskId: string;
      taskIdentifier: string;
      taskTitle: string;
    }[];
    nextCursor?: string;
  }> {
    const conditions: SQL[] = [
      eq(tasks.projectId, projectId),
      this.ownership(),
      this.activitiesOwnership(),
    ];
    if (cursorId) {
      // Keyset on the feed's (createdAt desc, id desc) order. The cursor row
      // resolves inside the same project + visibility scope, so a foreign or
      // stale cursor yields an empty page rather than an arbitrary offset.
      const [cursor] = await this.db
        .select({ createdAt: taskActivities.createdAt, id: taskActivities.id })
        .from(taskActivities)
        .innerJoin(tasks, eq(taskActivities.taskId, tasks.id))
        .where(and(eq(taskActivities.id, cursorId), ...conditions))
        .limit(1);
      if (!cursor) return { items: [] };
      conditions.push(
        or(
          lt(taskActivities.createdAt, cursor.createdAt),
          and(eq(taskActivities.createdAt, cursor.createdAt), lt(taskActivities.id, cursor.id)),
        )!,
      );
    }
    const rows = await this.db
      .select({
        activity: taskActivities,
        taskId: tasks.id,
        taskIdentifier: tasks.identifier,
        taskTitle: sql<string>`coalesce(${tasks.name}, ${tasks.instruction})`.as('task_title'),
      })
      .from(taskActivities)
      .innerJoin(tasks, eq(taskActivities.taskId, tasks.id))
      .where(and(...conditions))
      .orderBy(desc(taskActivities.createdAt), desc(taskActivities.id))
      .limit(limit + 1);
    return {
      items: rows.slice(0, limit),
      nextCursor: rows.length > limit ? rows[limit - 1]?.activity.id : undefined,
    };
  }

  // ========== Transfer / Copy ==========

  /**
   * Collect a task and all its descendants (parentTaskId-linked) via BFS.
   * Honors the current ownership scope.
   */
  private async collectTaskSubtree(rootId: string, runner: OrviloDatabase): Promise<TaskItem[]> {
    const [root] = await runner
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, rootId), this.ownership()))
      .limit(1);
    if (!root) return [];

    const collected: TaskItem[] = [root];
    let frontier: string[] = [root.id];

    while (frontier.length > 0) {
      const children = await runner
        .select()
        .from(tasks)
        .where(and(inArray(tasks.parentTaskId, frontier), this.ownership()));
      if (children.length === 0) break;
      collected.push(...children);
      frontier = children.map((c) => c.id);
    }

    return collected;
  }

  /**
   * Allocate a contiguous block of seq numbers + identifiers in the target
   * scope. Returns the next available seq baseline.
   */
  private async nextSeqIn(
    runner: OrviloDatabase,
    targetWorkspaceId: string | null,
    targetUserId: string,
  ): Promise<number> {
    const where = targetWorkspaceId
      ? eq(tasks.workspaceId, targetWorkspaceId)
      : and(eq(tasks.createdByUserId, targetUserId), isNull(tasks.workspaceId));
    const [{ maxSeq }] = await runner
      .select({ maxSeq: sql<number>`COALESCE(MAX(${tasks.seq}), 0)` })
      .from(tasks)
      .where(where!);
    return Number(maxSeq) + 1;
  }

  /**
   * Transfer a task subtree to another workspace / personal scope. Reallocates
   * `identifier`/`seq` in the target scope and rewrites the child tables that
   * mirror the parent's ownership (`task_dependencies`, `task_documents`,
   * `task_comments`, `task_activities`) so the ownership predicates keep
   * resolving after the move — those mirrored columns are what authorizes
   * reads, so a child left behind goes invisible in the destination scope.
   *
   * NOTE: `task_topics` and `briefs` carry the same mirrored columns but are
   * not rewritten here. Pre-existing gap, called out rather than widened.
   *
   * Cross-scope references that may no longer be valid are cleared:
   *   - `assigneeAgentId` (workspace move: agent likely doesn't exist there)
   *   - `currentTopicId` (topic ownership is also moving but the link is
   *     reset to avoid surfacing a stale active topic in the new scope)
   */
  /**
   * Whether the task subtree contains rows created by someone else. Transfers
   * rehome every cascaded row, so non-owner members must not move a task tree
   * that carries teammates' subtasks.
   */
  async subtreeHasForeignRows(taskId: string): Promise<boolean> {
    const subtree = await this.collectTaskSubtree(taskId, this.db);
    return subtree.some((task) => task.createdByUserId !== this.userId);
  }

  async transferTo(
    taskId: string,
    targetWorkspaceId: string | null,
    targetUserId: string,
    targetVisibility?: 'private' | 'public',
  ): Promise<{ taskIds: string[] }> {
    return this.db.transaction(async (trx) => {
      const scoped = new TaskModel(trx as OrviloDatabase, this.userId, this.workspaceId);
      const subtree = await scoped.collectTaskSubtree(taskId, trx as OrviloDatabase);
      if (subtree.length === 0) throw new Error('Task not found');

      const ids = subtree.map((t) => t.id);

      // Visibility only applies when landing in a workspace. In personal scope
      // every row is implicitly private and the field is ignored.
      const visibilityUpdate =
        targetWorkspaceId && targetVisibility ? { visibility: targetVisibility } : {};

      // Reallocate identifier + seq in target scope to avoid collisions.
      const baseSeq = await this.nextSeqIn(trx as OrviloDatabase, targetWorkspaceId, targetUserId);
      // Update each task individually because identifier/seq are per-row.
      for (const [idx, task] of subtree.entries()) {
        const seq = baseSeq + idx;
        const identifier = `T-${seq}`;
        await (trx as OrviloDatabase)
          .update(tasks)
          .set({
            // Clear cross-scope refs: agent / topic may be invalid in new scope.
            assigneeAgentId: targetWorkspaceId === this.workspaceId ? task.assigneeAgentId : null,
            createdByUserId: targetUserId,
            currentTopicId: null,
            identifier,
            seq,
            updatedAt: new Date(),
            workspaceId: targetWorkspaceId,
            ...visibilityUpdate,
          })
          .where(eq(tasks.id, task.id));
      }

      // Update child tables that key off taskId. Child rows mirror the parent
      // task's visibility (see schema comments on task_deps / task_docs /
      // task_comments) so cascade the new visibility here too.
      const ownershipUpdate = { userId: targetUserId, workspaceId: targetWorkspaceId };
      await (trx as OrviloDatabase)
        .update(taskDependencies)
        .set({ ...ownershipUpdate, ...visibilityUpdate })
        .where(inArray(taskDependencies.taskId, ids));
      await (trx as OrviloDatabase)
        .update(taskDocuments)
        .set({ ...ownershipUpdate, ...visibilityUpdate })
        .where(inArray(taskDocuments.taskId, ids));
      await (trx as OrviloDatabase)
        .update(taskComments)
        .set({ ...ownershipUpdate, ...visibilityUpdate })
        .where(inArray(taskComments.taskId, ids));
      await (trx as OrviloDatabase)
        .update(taskActivities)
        .set({ ...ownershipUpdate, ...visibilityUpdate })
        .where(inArray(taskActivities.taskId, ids));

      return { taskIds: ids };
    });
  }

  /**
   * Deep clone a task subtree into another workspace / personal scope. Fresh
   * ids, fresh identifiers, preserved parent/child topology. Cross-scope refs
   * (agent / topic / brief / current topic) are cleared on the clones so the
   * copies start clean in the new scope.
   */
  async copyToWorkspace(
    taskId: string,
    targetWorkspaceId: string | null,
    targetUserId: string,
    targetVisibility?: 'private' | 'public',
  ): Promise<{ rootId: string }> {
    return this.db.transaction(async (trx) => {
      const scoped = new TaskModel(trx as OrviloDatabase, this.userId, this.workspaceId);
      const subtree = await scoped.collectTaskSubtree(taskId, trx as OrviloDatabase);
      if (subtree.length === 0) throw new Error('Task not found');

      // Visibility only applies when landing in a workspace.
      const visibilityOverride =
        targetWorkspaceId && targetVisibility ? { visibility: targetVisibility } : {};

      // BFS clone — parent inserted before children, so we always know the
      // new parentTaskId by the time we reach the child.
      const idMap = new Map<string, string>();
      const byId = new Map(subtree.map((t) => [t.id, t]));
      const queue: string[] = [taskId];
      const seen = new Set<string>();

      let seq = await this.nextSeqIn(trx as OrviloDatabase, targetWorkspaceId, targetUserId);

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (seen.has(currentId)) continue;
        seen.add(currentId);
        const original = byId.get(currentId);
        if (!original) continue;

        const newParentId =
          currentId === taskId ? null : (idMap.get(original.parentTaskId!) ?? null);

        const identifier = `T-${seq}`;
        const inserted = (await (trx as OrviloDatabase)
          .insert(tasks)
          .values({
            assigneeAgentId: null,
            assigneeUserId: null,
            automationMode: original.automationMode,
            config: original.config ?? {},
            context: {
              ...(original.context as Record<string, unknown>),
              duplicatedFrom: original.id,
            },
            createdByAgentId: null,
            createdByUserId: targetUserId,
            currentTopicId: null,
            description: original.description,
            error: null,
            heartbeatInterval: original.heartbeatInterval,
            heartbeatTimeout: original.heartbeatTimeout,
            identifier,
            instruction: original.instruction,
            maxTopics: original.maxTopics,
            name: original.name,
            parentTaskId: newParentId,
            priority: original.priority,
            schedulePattern: original.schedulePattern,
            scheduleTimezone: original.scheduleTimezone,
            seq,
            sortOrder: original.sortOrder,
            // Reset lifecycle: copy starts fresh, not mid-run.
            status: 'backlog',
            totalTopics: 0,
            workspaceId: targetWorkspaceId,
            ...visibilityOverride,
          } as NewTask)
          .returning({ id: tasks.id })) as { id: string }[];

        idMap.set(original.id, inserted[0]!.id);
        seq++;

        for (const c of subtree) {
          if (c.parentTaskId === original.id) queue.push(c.id);
        }
      }

      return { rootId: idMap.get(taskId)! };
    });
  }
}
