import { randomUUID } from 'node:crypto';

import type { OrchestrationWorkflowStatus } from '@orvilo/const/orchestrationWorkflow';
import type {
  OrchestrationWorkflowNodeStatus,
  OrchestrationWorkflowSupervisionState,
} from '@orvilo/types';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import type {
  NewOrchestrationWorkflow,
  OrchestrationWorkflowItem,
} from '../schemas/orchestrationWorkflow';
import { orchestrationWorkflows } from '../schemas/orchestrationWorkflow';
import {
  orchestrationWorkflowNodeDecisions,
  orchestrationWorkflowNodes,
} from '../schemas/orchestrationWorkflowGraph';
import { tasks, taskTopics } from '../schemas/task';
import { topics } from '../schemas/topic';
import type { OrviloDatabase } from '../type';
import { buildWorkspacePayload, buildWorkspaceWhere } from '../utils/workspace';

/** States after which a orchestration workflow's loop no longer advances. */
const TERMINAL_ORCHESTRATION_WORKFLOW_STATUSES = new Set<OrchestrationWorkflowStatus>([
  'achieved',
  'failed',
  'canceled',
]);

/** Node states the coordinator will never pick up again. */
const TERMINAL_NODE_STATUSES = new Set<OrchestrationWorkflowNodeStatus>([
  'resolved',
  'rejected',
  'retired',
]);

/**
 * Owns the `orchestration workflows` table: one row per orchestration workflow — an independent target entity with
 * its own definition (title / requirement), budget and lifecycle state.
 *
 * Execution lives in the orchestration workflow's graph, not on the orchestration workflow row: the coordinator
 * dispatches a Task per task node, and everything execution-specific (attempts,
 * cost, acceptance) is derived from those tasks at read time.
 */
export class OrchestrationWorkflowModel {
  private readonly db: OrviloDatabase;
  private readonly userId: string;
  private readonly workspaceId?: string;

  constructor(db: OrviloDatabase, userId: string, workspaceId?: string) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
  }

  /**
   * The orchestration workflow owns a OrchestrationWorkflow Graph. `orchestrationWorkflow.create` always seeds a problem node and
   * the opening Tasks, so this is exactly "not a leftover from the old
   * task-carried flow".
   */
  private static hasGraphSql = sql`EXISTS (
    SELECT 1 FROM ${orchestrationWorkflowNodes} WHERE ${orchestrationWorkflowNodes.orchestrationWorkflowId} = ${orchestrationWorkflows.id}
  )`;

  private ownership = () =>
    buildWorkspaceWhere(
      { userId: this.userId, workspaceId: this.workspaceId },
      orchestrationWorkflows,
    );

  /** Visibility-aware task scope for recursive raw-SQL carrier aggregation. */
  private taskOwnershipSql = (alias?: string) => {
    const prefix = alias ? sql.raw(`${alias}.`) : sql.raw('');
    return this.workspaceId
      ? sql`${prefix}workspace_id = ${this.workspaceId}
            AND (${prefix}visibility = 'public' OR ${prefix}created_by_user_id = ${this.userId})`
      : sql`${prefix}created_by_user_id = ${this.userId} AND ${prefix}workspace_id IS NULL`;
  };

  create = async (
    params: Omit<NewOrchestrationWorkflow, 'userId' | 'workspaceId'>,
  ): Promise<OrchestrationWorkflowItem> => {
    const [row] = await this.db
      .insert(orchestrationWorkflows)
      .values(buildWorkspacePayload({ userId: this.userId, workspaceId: this.workspaceId }, params))
      .returning();
    return row;
  };

  findById = async (id: string): Promise<OrchestrationWorkflowItem | undefined> => {
    const [row] = await this.db
      .select()
      .from(orchestrationWorkflows)
      .where(and(eq(orchestrationWorkflows.id, id), this.ownership()))
      .limit(1);
    return row;
  };

  /** Lock the owned Orchestration workflow while committing a supervisor transition. Call inside a transaction. */
  lockById = async (id: string): Promise<OrchestrationWorkflowItem | undefined> => {
    const [row] = await this.db
      .select()
      .from(orchestrationWorkflows)
      .where(and(eq(orchestrationWorkflows.id, id), this.ownership()))
      .for('update')
      .limit(1);
    return row;
  };

  /** The Orchestration workflow Graph that owns this Task, or undefined when the task is not graph-managed. */
  findByGraphTask = async (taskId: string): Promise<OrchestrationWorkflowItem | undefined> => {
    const [row] = await this.db
      .select({ orchestrationWorkflow: orchestrationWorkflows })
      .from(orchestrationWorkflowNodes)
      .innerJoin(
        orchestrationWorkflows,
        eq(orchestrationWorkflowNodes.orchestrationWorkflowId, orchestrationWorkflows.id),
      )
      .where(
        and(
          eq(orchestrationWorkflowNodes.taskId, taskId),
          eq(orchestrationWorkflowNodes.kind, 'task'),
          this.ownership(),
        ),
      )
      .limit(1);
    return row?.orchestrationWorkflow;
  };

  /**
   * Patch only `config.pausedBy`, leaving every other key in the column alone.
   *
   * The coordinator writes this marker from a tick while the user edits budget
   * and acceptance criteria on the same JSONB column from the orchestration workflow page. A
   * read-modify-write of the whole config would let whichever landed second
   * discard the other's work — the user's new criteria, or the marker a
   * measured-acceptance orchestration workflow needs to ever reopen.
   */
  updatePauseReason = async (id: string, reason: string | undefined): Promise<void> => {
    await this.db
      .update(orchestrationWorkflows)
      .set({
        config: reason
          ? sql`jsonb_set(COALESCE(${orchestrationWorkflows.config}, '{}'::jsonb), '{pausedBy}', ${JSON.stringify(reason)}::jsonb)`
          : sql`COALESCE(${orchestrationWorkflows.config}, '{}'::jsonb) - 'pausedBy'`,
        updatedAt: new Date(),
      })
      .where(and(eq(orchestrationWorkflows.id, id), this.ownership()));
  };

  /** A verifier repair may release only the system pause, never a person's pause. */
  reopenAfterVerifierRepair = async (id: string): Promise<boolean> => {
    const rows = await this.db
      .update(orchestrationWorkflows)
      .set({
        config: sql`coalesce(${orchestrationWorkflows.config}, '{}'::jsonb) - 'pausedBy'`,
        status: 'running',
        updatedAt: new Date(),
      })
      .where(
        and(
          this.ownership(),
          eq(orchestrationWorkflows.id, id),
          eq(orchestrationWorkflows.status, 'paused'),
          sql`${orchestrationWorkflows.config}->>'pausedBy' = 'verification_unavailable'`,
        ),
      )
      .returning({ id: orchestrationWorkflows.id });
    return rows.length > 0;
  };

  /** Compare-and-swap only the supervisor namespace; concurrent budget edits survive. */
  updateSupervisorState = async (
    id: string,
    expectedRevision: number,
    state: Omit<OrchestrationWorkflowSupervisionState, 'revision'>,
  ): Promise<OrchestrationWorkflowSupervisionState | undefined> => {
    const next = { ...state, revision: expectedRevision + 1 };
    const [row] = await this.db
      .update(orchestrationWorkflows)
      .set({
        config: sql`jsonb_set(COALESCE(${orchestrationWorkflows.config}, '{}'::jsonb), '{supervisorState}', ${JSON.stringify(next)}::jsonb)`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orchestrationWorkflows.id, id),
          this.ownership(),
          sql`COALESCE((${orchestrationWorkflows.config}->'supervisorState'->>'revision')::integer, 0) = ${expectedRevision}`,
        ),
      )
      .returning({ id: orchestrationWorkflows.id });
    return row ? next : undefined;
  };

  update = async (id: string, value: Partial<Omit<OrchestrationWorkflowItem, 'id' | 'userId'>>) => {
    const [row] = await this.db
      .update(orchestrationWorkflows)
      .set({
        ...value,
        // Policy editors may carry a pre-claim or pre-release snapshot. Runtime
        // ownership always comes from the current row, never that snapshot, and
        // policy edits cannot replace the concurrently written incident ledger.
        ...(value.config !== undefined
          ? {
              config: sql`(COALESCE(${JSON.stringify(value.config ?? {})}::jsonb, '{}'::jsonb) - 'planningCheckpoint' - 'planningProtocol' - 'supervisorState' - 'managerState')
                || jsonb_strip_nulls(jsonb_build_object(
                  'planningCheckpoint', ${orchestrationWorkflows.config}->'planningCheckpoint',
                  'planningProtocol', ${orchestrationWorkflows.config}->'planningProtocol',
                  'supervisorState', ${orchestrationWorkflows.config}->'supervisorState',
                  'managerState', ${orchestrationWorkflows.config}->'managerState'
                ))`,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(orchestrationWorkflows.id, id), this.ownership()))
      .returning();
    return row as OrchestrationWorkflowItem | undefined;
  };

  /** Call inside a transaction when a coordinator needs to serialize a write. */
  findByIdForUpdate = async (id: string) => {
    const [row] = await this.db
      .select()
      .from(orchestrationWorkflows)
      .where(and(eq(orchestrationWorkflows.id, id), this.ownership()))
      .limit(1)
      .for('update');
    return row;
  };

  /** Claim a bounded planning lease without holding a connection during the model call. */
  claimPlanning = async (id: string) =>
    this.db.transaction(async (tx) => {
      const model = new OrchestrationWorkflowModel(tx, this.userId, this.workspaceId);
      const orchestrationWorkflow = await model.findByIdForUpdate(id);
      if (!orchestrationWorkflow || !['planning', 'running'].includes(orchestrationWorkflow.status))
        return undefined;
      // A running orchestration workflow without lease provenance may still have an unfenced
      // pre-lease worker in flight. Never infer abandonment from elapsed time.
      // See docs/development/orchestration-workflow-planning-lease-rollout.md before rollout/rollback.
      if (
        orchestrationWorkflow.status === 'running' &&
        !orchestrationWorkflow.config?.planningProtocol &&
        !orchestrationWorkflow.config?.planningCheckpoint
      )
        return undefined;
      const now = Date.now();
      if (
        orchestrationWorkflow.config?.planningCheckpoint &&
        Date.parse(orchestrationWorkflow.config.planningCheckpoint.expiresAt) > now
      )
        return undefined;
      const [task] = await tx
        .select({ id: orchestrationWorkflowNodes.id })
        .from(orchestrationWorkflowNodes)
        .where(
          and(
            eq(orchestrationWorkflowNodes.orchestrationWorkflowId, id),
            eq(orchestrationWorkflowNodes.kind, 'task'),
          ),
        )
        .limit(1);
      if (task) return undefined;
      const checkpoint = {
        token: randomUUID(),
        expiresAt: new Date(now + 5 * 60_000).toISOString(),
      };
      await tx
        .update(orchestrationWorkflows)
        .set({
          config: {
            ...orchestrationWorkflow.config,
            planningCheckpoint: checkpoint,
            planningProtocol: 'lease-v1',
          },
          startedAt: orchestrationWorkflow.startedAt ?? new Date(now),
          status: 'running',
          updatedAt: new Date(now),
        })
        .where(eq(orchestrationWorkflows.id, id));
      return { ...checkpoint, previousStatus: orchestrationWorkflow.status };
    });

  /** A late worker must never clear a newer worker's lease or other configuration. */
  releasePlanning = async (id: string, token: string) => {
    await this.db
      .update(orchestrationWorkflows)
      .set({
        config: sql`${orchestrationWorkflows.config} - 'planningCheckpoint'`,
      })
      .where(
        and(
          eq(orchestrationWorkflows.id, id),
          this.ownership(),
          sql`${orchestrationWorkflows.config}->'planningCheckpoint'->>'token' = ${token}`,
        ),
      );
  };

  /**
   * Advance the lifecycle state, stamping the boundary timestamps as a side
   * effect: first entry into `running` records `startedAt`, any terminal state
   * records `completedAt` (and re-opening a terminal orchestration workflow clears it).
   */
  updateStatus = async (id: string, status: OrchestrationWorkflowStatus) => {
    const existing = await this.findById(id);
    if (!existing) return undefined;

    return this.update(id, {
      completedAt: TERMINAL_ORCHESTRATION_WORKFLOW_STATUSES.has(status)
        ? (existing.completedAt ?? new Date())
        : null,
      startedAt: existing.startedAt ?? (status === 'running' ? new Date() : null),
      status,
    });
  };

  delete = async (id: string) => {
    return this.db
      .delete(orchestrationWorkflows)
      .where(and(eq(orchestrationWorkflows.id, id), this.ownership()));
  };

  /**
   * Open orchestration workflows that nothing is currently moving — the sweep's work list.
   *
   * A orchestration workflow qualifies when it is still open and has no task node that is both
   * `active` and freshly touched: either nothing was ever dispatched, the
   * completion event that should have re-entered the coordinator was lost, or a
   * running Task outlived its operation lease and needs reclaiming. OrchestrationWorkflows with a
   * decision gate open are excluded — only a human moves those, and ticking them
   * would just report `waiting_human` on every sweep.
   *
   * Global by design (no ownership filter): the sweep runs as infrastructure and
   * carries each orchestration workflow's own `userId` / `workspaceId` into its advance.
   */
  static async listStalled(
    db: OrviloDatabase,
    options: { limit?: number; staleBefore: Date },
  ): Promise<OrchestrationWorkflowItem[]> {
    const { limit = 200, staleBefore } = options;

    return db
      .select()
      .from(orchestrationWorkflows)
      .where(
        and(
          inArray(orchestrationWorkflows.status, ['planning', 'running', 'verifying']),
          // A graph-less legacy orchestration workflow has no frontier, so every sweep would
          // tick it only to report `no_progress`. Leave it alone.
          OrchestrationWorkflowModel.hasGraphSql,
          sql`NOT EXISTS (
            SELECT 1 FROM ${orchestrationWorkflowNodes}
            WHERE ${orchestrationWorkflowNodes.orchestrationWorkflowId} = ${orchestrationWorkflows.id}
              AND ${orchestrationWorkflowNodes.kind} = 'task'
              AND ${orchestrationWorkflowNodes.status} = 'active'
              AND ${orchestrationWorkflowNodes.updatedAt} > ${staleBefore}
          )`,
          sql`NOT EXISTS (
            SELECT 1 FROM ${orchestrationWorkflowNodeDecisions}
            JOIN ${orchestrationWorkflowNodes} AS gate ON gate.id = ${orchestrationWorkflowNodeDecisions.nodeId}
            WHERE gate.orchestration_workflow_id = ${orchestrationWorkflows.id}
              AND ${orchestrationWorkflowNodeDecisions.status} = 'pending'
          )`,
        ),
      )
      .orderBy(desc(orchestrationWorkflows.updatedAt))
      .limit(limit);
  }

  /**
   * List orchestration workflows with the roll-up the orchestration workflow surfaces render: how much of the
   * graph is done, how many decisions are waiting on a human, and what the
   * whole thing has cost so far.
   *
   * OrchestrationWorkflow-centric on purpose. OrchestrationWorkflows used to be listed through their carrier
   * task, which made a orchestration workflow without one invisible; a OrchestrationWorkflow Graph orchestration workflow is
   * `standalone`, so the list reads the `orchestration workflows` table and derives execution
   * facts from the graph's tasks.
   */
  list = async (
    options: {
      agentId?: string;
      limit?: number;
      offset?: number;
      projectId?: string;
      statuses?: OrchestrationWorkflowStatus[];
    } = {},
  ): Promise<{ orchestrationWorkflows: OrchestrationWorkflowListItem[]; total: number }> => {
    const { agentId, limit = 50, offset = 0, projectId, statuses } = options;

    // Only orchestration workflows that actually have a graph. Rows created by the earlier
    // task-carried flow have no `orchestration_workflow_nodes`, so they would render as a
    // zero-task orchestration workflow page that can never advance; they stay out of the list
    // until something backfills them into graphs.
    const conditions = [this.ownership(), OrchestrationWorkflowModel.hasGraphSql];
    if (agentId) conditions.push(eq(orchestrationWorkflows.agentId, agentId));
    if (projectId) conditions.push(eq(orchestrationWorkflows.projectId, projectId));
    if (statuses && statuses.length > 0)
      conditions.push(inArray(orchestrationWorkflows.status, statuses));

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(orchestrationWorkflows)
      .where(and(...conditions));

    const total = Number(countRow?.count ?? 0);
    if (total === 0) return { orchestrationWorkflows: [], total };

    const rows = await this.db
      .select()
      .from(orchestrationWorkflows)
      .where(and(...conditions))
      .orderBy(desc(orchestrationWorkflows.createdAt))
      .limit(limit)
      .offset(offset);

    const orchestrationWorkflowIds = rows.map((orchestrationWorkflow) => orchestrationWorkflow.id);
    const [nodeRows, decisionRows, runStats] = await Promise.all([
      this.db
        .select({
          orchestrationWorkflowId: orchestrationWorkflowNodes.orchestrationWorkflowId,
          kind: orchestrationWorkflowNodes.kind,
          status: orchestrationWorkflowNodes.status,
          count: sql<number>`count(*)`,
        })
        .from(orchestrationWorkflowNodes)
        .where(
          inArray(orchestrationWorkflowNodes.orchestrationWorkflowId, orchestrationWorkflowIds),
        )
        .groupBy(
          orchestrationWorkflowNodes.orchestrationWorkflowId,
          orchestrationWorkflowNodes.kind,
          orchestrationWorkflowNodes.status,
        ),
      this.db
        .select({
          orchestrationWorkflowId: orchestrationWorkflowNodes.orchestrationWorkflowId,
          count: sql<number>`count(*)`,
        })
        .from(orchestrationWorkflowNodeDecisions)
        .innerJoin(
          orchestrationWorkflowNodes,
          eq(orchestrationWorkflowNodeDecisions.nodeId, orchestrationWorkflowNodes.id),
        )
        .where(
          and(
            inArray(orchestrationWorkflowNodes.orchestrationWorkflowId, orchestrationWorkflowIds),
            eq(orchestrationWorkflowNodeDecisions.status, 'pending'),
          ),
        )
        .groupBy(orchestrationWorkflowNodes.orchestrationWorkflowId),
      this.graphTaskRunStats(orchestrationWorkflowIds),
    ]);

    const stats = new Map<string, { findingCount: number; taskDone: number; taskTotal: number }>();
    for (const row of nodeRows) {
      const current = stats.get(row.orchestrationWorkflowId) ?? {
        findingCount: 0,
        taskDone: 0,
        taskTotal: 0,
      };
      const count = Number(row.count);
      if (row.kind === 'finding') current.findingCount += count;
      if (row.kind === 'task') {
        current.taskTotal += count;
        if (TERMINAL_NODE_STATUSES.has(row.status)) current.taskDone += count;
      }
      stats.set(row.orchestrationWorkflowId, current);
    }
    const pendingByOrchestrationWorkflow = new Map(
      decisionRows.map((row) => [row.orchestrationWorkflowId, Number(row.count)]),
    );

    const items: OrchestrationWorkflowListItem[] = rows.map((orchestrationWorkflow) => {
      const counts = stats.get(orchestrationWorkflow.id) ?? {
        findingCount: 0,
        taskDone: 0,
        taskTotal: 0,
      };
      const run = runStats.get(orchestrationWorkflow.id) ?? {
        totalRunCost: 0,
        totalRunDuration: 0,
      };
      return {
        findingCount: counts.findingCount,
        orchestrationWorkflow,
        pendingDecisions: pendingByOrchestrationWorkflow.get(orchestrationWorkflow.id) ?? 0,
        taskDone: counts.taskDone,
        taskTotal: counts.taskTotal,
        totalRunCost: run.totalRunCost,
        totalRunDuration: run.totalRunDuration,
      };
    });

    return { orchestrationWorkflows: items, total };
  };

  /**
   * Cost and runtime across every task the graph dispatched, including tasks
   * those graph tasks spawned themselves — the same subtree rule the task board
   * uses, seeded from the task nodes instead of one carrier root.
   */
  private graphTaskRunStats = async (orchestrationWorkflowIds: string[]) => {
    if (orchestrationWorkflowIds.length === 0)
      return new Map<string, { totalRunCost: number; totalRunDuration: number }>();

    const { rows } = await this.db.execute<{
      orchestrationWorkflow_id: string;
      total_run_cost: number;
      total_run_duration: number;
    }>(sql`
      WITH RECURSIVE task_tree AS (
        SELECT ${orchestrationWorkflowNodes.orchestrationWorkflowId} AS orchestration_workflow_id, ${tasks.id} AS task_id
        FROM ${orchestrationWorkflowNodes}
        JOIN ${tasks} ON ${tasks.id} = ${orchestrationWorkflowNodes.taskId}
        WHERE ${inArray(orchestrationWorkflowNodes.orchestrationWorkflowId, orchestrationWorkflowIds)}
          AND ${orchestrationWorkflowNodes.kind} = 'task'
          AND ${this.taskOwnershipSql('tasks')}
        UNION ALL
        SELECT task_tree.orchestration_workflow_id, child.id
        FROM ${tasks} child
        JOIN task_tree ON child.parent_task_id = task_tree.task_id
        WHERE ${this.taskOwnershipSql('child')}
      )
      SELECT
        task_tree.orchestration_workflow_id,
        coalesce(sum(${topics.totalCost}), 0) AS total_run_cost,
        coalesce(
          sum(extract(epoch from (${topics.completedAt} - ${taskTopics.createdAt})) * 1000)
            filter (where ${topics.completedAt} is not null),
          0
        ) AS total_run_duration
      FROM task_tree
      LEFT JOIN ${taskTopics} ON ${taskTopics.taskId} = task_tree.task_id
      LEFT JOIN ${topics} ON ${topics.id} = ${taskTopics.topicId}
      GROUP BY task_tree.orchestration_workflow_id
    `);

    return new Map(
      rows.map((row) => [
        row.orchestrationWorkflow_id,
        {
          totalRunCost: Number(row.total_run_cost),
          totalRunDuration: Number(row.total_run_duration),
        },
      ]),
    );
  };
}

/**
 * A orchestration workflow-list row: the orchestration workflow itself plus the graph roll-up the list renders —
 * how far the exploration got, what is blocked on a human, and what it cost.
 */
export interface OrchestrationWorkflowListItem {
  findingCount: number;
  orchestrationWorkflow: OrchestrationWorkflowItem;
  /** Decision gates waiting on a human right now. */
  pendingDecisions: number;
  /** Task nodes in a terminal status (resolved / rejected / retired). */
  taskDone: number;
  taskTotal: number;
  totalRunCost: number;
  totalRunDuration: number;
}
