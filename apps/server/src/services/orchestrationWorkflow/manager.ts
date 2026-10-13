import { createHash, randomUUID } from 'node:crypto';

import { ORCHESTRATION_WORKFLOW_ACCEPTANCE_TASK_TITLE } from '@orvilo/const/orchestrationWorkflow';
import { buildOrchestrationWorkflowManagerPrompt } from '@orvilo/prompts';
import type {
  OrchestrationWorkflowGraphSnapshot,
  OrchestrationWorkflowManagerState,
  OrchestrationWorkflowTickResult,
  TaskItem,
} from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { AgentOperationModel } from '@/database/models/agentOperation';
import { OrchestrationWorkflowModel } from '@/database/models/orchestrationWorkflow';
import { OrchestrationWorkflowGraphModel } from '@/database/models/orchestrationWorkflowGraph';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { TopicModel } from '@/database/models/topic';
import { orchestrationWorkflows } from '@/database/schemas/orchestrationWorkflow';
import type { OrviloDatabase } from '@/database/type';
import { AiAgentService } from '@/server/services/aiAgent';

import { scheduleOrchestrationWorkflowAdvance } from './scheduler';
import { recoveryEligibility } from './supervisor/policy';

const reason = z.string().trim().min(1).max(8000);
export const orchestrationWorkflowPlanSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('tasks'),
      reason,
      tasks: z
        .array(z.object({ title: z.string().trim().min(1).max(255), description: reason }))
        .min(1)
        .max(10),
    })
    .strict(),
  z.object({ action: z.literal('verify'), reason }).strict(),
  z
    .object({
      action: z.literal('retry'),
      reason,
      taskId: z.string().min(1),
      failedOperationId: z.string().min(1),
    })
    .strict(),
  z.object({ action: z.literal('escalate'), reason }).strict(),
  /**
   * CAID incremental plan patch. Unlike `tasks`/`verify` — which require all
   * existing work settled — `patch` may land while sibling nodes still run:
   * appends are additive, `replace`/`retire` are refused on nodes whose run
   * contract is already frozen, and `expectedPlanRevision` is a
   * compare-and-swap on `config.caidPlan.revision` so two managers cannot
   * interleave plan revisions.
   */
  z
    .object({
      action: z.literal('patch'),
      expectedPlanRevision: z.number().int().min(0),
      patches: z
        .array(
          z.discriminatedUnion('op', [
            z
              .object({
                dependsOn: z.array(z.string().min(1)).optional(),
                key: z.string().trim().min(1).max(64).optional(),
                op: z.literal('append'),
                task: z
                  .object({ title: z.string().trim().min(1).max(255), description: reason })
                  .strict(),
              })
              .strict(),
            z
              .object({
                description: reason.optional(),
                nodeId: z.string().min(1),
                op: z.literal('replace'),
                title: z.string().trim().min(1).max(255).optional(),
              })
              .strict(),
            z.object({ nodeId: z.string().min(1), op: z.literal('retire') }).strict(),
          ]),
        )
        .min(1)
        .max(20),
      reason,
      strategy: z.literal('caid'),
    })
    .strict(),
]);
type OrchestrationWorkflowPlan = z.infer<typeof orchestrationWorkflowPlanSchema>;
const activeStatuses = new Set(['planning', 'running']);
const terminalOperations = new Set(['done', 'error', 'interrupted']);
const terminalNodes = new Set(['resolved', 'retired', 'rejected']);
/** Node states whose bound work is already frozen — a running/active Task row
 * or an activated node carries a contract the plan must not rewrite. */
const contractFrozenNodes = new Set(['active']);
const TIMEOUT_MS = 20 * 60_000;

/** Excludes only the manager's own receipt. Concurrent policy/graph changes invalidate its plan. */
export const managerSnapshot = (graph: OrchestrationWorkflowGraphSnapshot) => {
  const { managerState: _state, ...config } = graph.orchestrationWorkflow.config ?? {};
  return createHash('sha256')
    .update(
      JSON.stringify({
        requirement: graph.orchestrationWorkflow.requirement,
        config,
        maxRounds: graph.orchestrationWorkflow.maxRounds,
        maxTotalCost: graph.orchestrationWorkflow.maxTotalCost,
        nodes: graph.nodes,
        edges: graph.edges,
        decisions: graph.decisions,
        versions: graph.workVersions.map(({ nodeId, workVersionId, relation }) => ({
          nodeId,
          workVersionId,
          relation,
        })),
      }),
    )
    .digest('hex');
};

/** Durable wakeups around ordinary CLI-capable Agent runs. No supervisor builtin tools. */
/** A takeover problem is identified by the task it blocked, not by its wording
 *  alone: "Task attempt budget was exhausted" is the same sentence for every task
 *  that reaches it, so a reason-only key makes the second task inherit the first
 *  one's answer. */
export const problemKey = (problem: { reason: string; taskId?: string }) =>
  `${problem.taskId ?? 'orchestrationWorkflow'}::${problem.reason}`;

/**
 * The problem a settled takeover turn already answered, with the answer.
 *
 * Reading it is how the coordinator tells "nobody has looked at this yet" from
 * "the main Agent looked and this is what it said". Any committed answer counts,
 * not just `escalate`: if the Agent's plan did not unstick the OrchestrationWorkflow, handing the
 * same problem over again only buys the same plan, so the Gate is the honest next
 * step and the Agent's reasoning rides along on it.
 */
export const answeredProblem = (state?: OrchestrationWorkflowManagerState) =>
  state?.consumed && state.problem && state.submitted
    ? { key: state.problem, reason: state.submitted.reason }
    : undefined;

export class OrchestrationWorkflowManagerService {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  usage = async (state?: OrchestrationWorkflowManagerState) => {
    const operations = state
      ? await new AgentOperationModel(this.db, this.userId, this.workspaceId).listByTopic(
          state.topicId,
          100,
        )
      : [];
    return {
      totalCost: operations.reduce((sum, op) => sum + (Number(op.totalCost) || 0), 0),
      totalTokens: operations.reduce((sum, op) => sum + (op.totalTokens ?? 0), 0),
    };
  };

  private save = async (
    db: OrviloDatabase,
    id: string,
    state: OrchestrationWorkflowManagerState,
  ) => {
    // Caller holds the owned OrchestrationWorkflow row lock. Do not overwrite concurrent policy namespaces.
    await db
      .update(orchestrationWorkflows)
      .set({
        config: sql`jsonb_set(COALESCE(${orchestrationWorkflows.config}, '{}'::jsonb), '{managerState}', ${JSON.stringify(state)}::jsonb)`,
        updatedAt: new Date(),
      })
      .where(eq(orchestrationWorkflows.id, id));
  };

  private graph = (db = this.db) =>
    new OrchestrationWorkflowGraphModel(db, this.userId, this.workspaceId);

  private reviews = async (graph: OrchestrationWorkflowGraphSnapshot, db = this.db) => {
    const tasks = new TaskModel(db, this.userId, this.workspaceId);
    const visible = await tasks.findByIds(graph.nodes.flatMap((n) => (n.taskId ? [n.taskId] : [])));
    const comments = (
      await Promise.all(
        visible.map(async (task) =>
          (await tasks.getComments(task.id)).map((comment) => ({
            taskId: task.id,
            id: comment.id,
            content: comment.content,
            authorUserId: comment.authorUserId,
            authorAgentId: comment.authorAgentId,
            updatedAt: comment.updatedAt,
          })),
        ),
      )
    )
      .flat()
      .sort((a, b) => a.id.localeCompare(b.id));
    return {
      hash: createHash('sha256').update(JSON.stringify(comments)).digest('hex'),
      notes: JSON.stringify(
        [...comments]
          .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
          .slice(-20)
          .map((c) => ({ ...c, content: c.content.slice(0, 2000) })),
      ),
    };
  };

  private budgetBlocked = async (graph: OrchestrationWorkflowGraphSnapshot, db = this.db) => {
    const spend = await new TaskTopicModel(db, this.userId, this.workspaceId).sumRunCostByTaskIds(
      graph.nodes.flatMap((n) => (n.taskId ? [n.taskId] : [])),
    );
    const management = await new OrchestrationWorkflowManagerService(
      db,
      this.userId,
      this.workspaceId,
    ).usage(graph.orchestrationWorkflow.config?.managerState);
    const orchestrationWorkflow = graph.orchestrationWorkflow;
    return (
      (orchestrationWorkflow.maxRounds !== null && spend.runs >= orchestrationWorkflow.maxRounds) ||
      (orchestrationWorkflow.maxTotalCost !== null &&
        spend.totalCost + management.totalCost >= Number(orchestrationWorkflow.maxTotalCost)) ||
      (!!orchestrationWorkflow.config?.schedule?.deadline &&
        Date.now() >= Date.parse(orchestrationWorkflow.config.schedule.deadline))
    );
  };

  private wait = async (
    orchestrationWorkflowId: string,
    message: string,
  ): Promise<OrchestrationWorkflowTickResult> => {
    await scheduleOrchestrationWorkflowAdvance({
      orchestrationWorkflowId,
      userId: this.userId,
      workspaceId: this.workspaceId,
      delay: 5,
    });
    return { orchestrationWorkflowId, outcome: 'waiting_external', message };
  };

  private pause = async (
    orchestrationWorkflowId: string,
    message: string,
  ): Promise<OrchestrationWorkflowTickResult> => {
    await this.db.transaction(async (db) => {
      const model = new OrchestrationWorkflowModel(db, this.userId, this.workspaceId);
      const orchestrationWorkflow = await model.lockById(orchestrationWorkflowId);
      if (orchestrationWorkflow && activeStatuses.has(orchestrationWorkflow.status)) {
        await model.updateStatus(orchestrationWorkflowId, 'paused');
        await this.graph(db).recordOrchestrationWorkflowStatus(
          orchestrationWorkflowId,
          orchestrationWorkflow.status,
          'paused',
          message,
        );
      }
    });
    return { orchestrationWorkflowId, outcome: 'no_progress', message };
  };

  stop = async (graph: OrchestrationWorkflowGraphSnapshot) => {
    const state = graph.orchestrationWorkflow.config?.managerState;
    if (!state || state.consumed) return;
    const operations = new AgentOperationModel(this.db, this.userId, this.workspaceId);
    const op = state.operationId
      ? await operations.findById(state.operationId)
      : await operations.findByTopicSourceMessage(
          state.topicId,
          `msg_orchestration_workflow_manager_${state.token}`,
        );
    if (!op)
      throw new TRPCError({
        code: 'CONFLICT',
        message:
          'Main Agent dispatch is unconfirmed; retain the Orchestration workflow until its execution can be reconciled',
      });
    if (terminalOperations.has(op.status)) return;
    const result = await new AiAgentService(this.db, this.userId, {
      workspaceId: this.workspaceId,
    }).interruptTask({ operationId: op.id, topicId: state.topicId });
    if (!result.success || result.deviceCancellationConfirmed === false)
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Main Agent exit was not confirmed; Orchestration workflow was not deleted',
      });
  };

  /**
   * Advance the orchestration workflow through its main Agent.
   *
   * `mayStartTurn` is what orders the two planners. The system's own
   * exploration planner owns the ordinary path; a main Agent is the fallback for
   * problems that planner cannot express, so on a OrchestrationWorkflow that has exploration
   * configured this only settles a turn already in flight and otherwise declines.
   * A OrchestrationWorkflow whose only planner IS the main Agent keeps starting turns here.
   */
  advance = async (
    graph: OrchestrationWorkflowGraphSnapshot,
    options?: { mayStartTurn?: boolean },
  ): Promise<OrchestrationWorkflowTickResult | null> => {
    if (!this.eligible(graph)) return null;
    const settled = await this.settleInFlight(graph);
    if (settled) return settled;
    if (options?.mayStartTurn === false) return null;
    return this.startTurn(graph);
  };

  /**
   * Hand a problem the coordinator could not route to the main Agent, instead of
   * stopping the OrchestrationWorkflow on a person.
   *
   * The invitation IS the authorization: the caller has already decided it would
   * otherwise open a human gate, so the ordinary "is there unfinished work" and
   * "is this a recognised transport failure" narrowings do not apply — those
   * exist to stop an uninvited turn from preempting running work. Turn limits,
   * budgets and the compare-and-swap claim still hold, and a main Agent that
   * cannot help answers `escalate`, which puts the gate back.
   */
  takeOver = async (
    graph: OrchestrationWorkflowGraphSnapshot,
    problem: { reason: string; taskId?: string },
  ): Promise<OrchestrationWorkflowTickResult | null> => {
    if (!this.eligible(graph)) return null;
    // Already answered: a takeover turn that ran for THIS problem has had its say,
    // so handing it over again would buy the same plan instead of asking a person.
    // `answeredProblem` is what the caller attaches to the gate.
    if (
      answeredProblem(graph.orchestrationWorkflow.config?.managerState)?.key === problemKey(problem)
    )
      return null;
    const settled = await this.settleInFlight(graph);
    if (settled) return settled;
    return this.startTurn(graph, problem);
  };

  /** Shared entry conditions: a policy, an active Orchestration workflow, and nobody waiting on a person. */
  private eligible = (graph: OrchestrationWorkflowGraphSnapshot) =>
    Boolean(
      graph.orchestrationWorkflow.config?.manager &&
      activeStatuses.has(graph.orchestrationWorkflow.status) &&
      !graph.decisions.some((d) => d.status === 'pending'),
    );

  /**
   * Poll a dispatched turn. Runs on every tick regardless of who leads planning:
   * a turn already paid for has to be settled, or its plan would never land.
   */
  private settleInFlight = async (
    graph: OrchestrationWorkflowGraphSnapshot,
  ): Promise<OrchestrationWorkflowTickResult | null> => {
    const { orchestrationWorkflow } = graph;
    const state = orchestrationWorkflow.config?.managerState;
    if (state && !state.consumed) {
      const operation = await new AgentOperationModel(
        this.db,
        this.userId,
        this.workspaceId,
      ).findByTopicSourceMessage(
        state.topicId,
        `msg_orchestration_workflow_manager_${state.token}`,
      );
      if (!operation || !terminalOperations.has(operation.status)) {
        if (operation?.status === 'waiting_for_human') {
          await this.wait(orchestrationWorkflow.id, 'Main Agent is waiting for a human decision');
          return {
            orchestrationWorkflowId: orchestrationWorkflow.id,
            outcome: 'waiting_human',
            message: 'Main Agent is waiting for a human decision',
          };
        }
        if (Date.now() - Date.parse(state.startedAt) > TIMEOUT_MS) {
          return this.pause(
            orchestrationWorkflow.id,
            'Main Agent execution is unconfirmed or timed out. Confirm its exit before resuming; no replacement was dispatched.',
          );
        }
        return this.wait(orchestrationWorkflow.id, 'Waiting for main Agent CLI planning turn');
      }
      await this.db.transaction(async (db) => {
        const fresh = await new OrchestrationWorkflowModel(
          db,
          this.userId,
          this.workspaceId,
        ).lockById(orchestrationWorkflow.id);
        if (
          fresh?.config?.managerState?.token === state.token &&
          !fresh.config.managerState.consumed
        ) {
          await this.save(db, orchestrationWorkflow.id, {
            ...fresh.config.managerState,
            operationId: operation.id,
            consumed: true,
          });
        }
      });
      return {
        orchestrationWorkflowId: orchestrationWorkflow.id,
        outcome: 'advanced',
        message: state.submitted
          ? 'Main Agent plan committed; normal Task coordination continues'
          : 'Main Agent exited without a plan; a new bounded turn will reread durable state',
      };
    }
    return null;
  };

  /**
   * Whether an UNINVITED turn must stand down. A main Agent that nobody asked for
   * may only plan when the graph is quiet, or recover a failure the transport
   * whitelist recognises — anything else is work in flight that it would preempt.
   */
  private uninvitedTurnBlocked = async (
    graph: OrchestrationWorkflowGraphSnapshot,
    unfinished: OrchestrationWorkflowGraphSnapshot['nodes'],
    tasks: TaskItem[],
  ) => {
    const failed = tasks.find((t) => t.status === 'failed');
    if (!failed) return unfinished.length > 0;
    // Supervision owns recognised transport failures, and it is both cheaper than
    // a planning turn and stricter about who authored the status. Claiming one
    // uninvited would reverse that order and spend a turn on a failure the
    // supervisor recovers on its own; whatever it declines reaches
    // `gateOrTakeOver`, which invites this Agent properly.
    if (graph.orchestrationWorkflow.config?.supervision?.enabled) return true;
    const runs = await new TaskTopicModel(this.db, this.userId, this.workspaceId).findByTaskId(
      failed.id,
    );
    const op = runs[0]?.operationId
      ? await new AgentOperationModel(this.db, this.userId, this.workspaceId).findById(
          runs[0].operationId,
        )
      : undefined;
    return !recoveryEligibility(graph, failed, op).eligible;
  };

  private startTurn = async (
    graph: OrchestrationWorkflowGraphSnapshot,
    problem?: { reason: string; taskId?: string },
  ): Promise<OrchestrationWorkflowTickResult | null> => {
    const { orchestrationWorkflow } = graph;
    const policy = orchestrationWorkflow.config!.manager!;
    const state = orchestrationWorkflow.config?.managerState;
    const nodes = graph.nodes.filter((n) => n.kind === 'task');
    const unfinished = nodes.filter((n) => !terminalNodes.has(n.status));
    // An invited turn skips the checks below. They ask "should an uninvited main
    // Agent interrupt what is running", and the caller has already answered a
    // harder question: the coordinator is out of moves and the alternative is
    // stopping the OrchestrationWorkflow on a person. The acceptance guard belongs to that set too:
    // it means "verification exists, stop planning more work", which is right for an
    // uninvited turn and wrong for a takeover invited BECAUSE the terminal
    // acceptance is the thing that failed.
    if (!problem) {
      if (
        state?.readyForAcceptance ||
        nodes.some((n) => n.title === ORCHESTRATION_WORKFLOW_ACCEPTANCE_TASK_TITLE)
      )
        return null;
      const tasks = await new TaskModel(this.db, this.userId, this.workspaceId).findByIds(
        unfinished.flatMap((n) => (n.taskId ? [n.taskId] : [])),
      );
      const blocked = await this.uninvitedTurnBlocked(graph, unfinished, tasks);
      if (blocked) return null;
    }
    if ((state?.turns ?? 0) >= (policy.maxTurns ?? 12) || (await this.budgetBlocked(graph))) {
      // An invited turn declines instead of pausing. The caller was about to open
      // a gate carrying the actual problem; pausing here would replace that
      // question with "the main Agent is out of turns" and lose it.
      if (problem) return null;
      return this.pause(
        orchestrationWorkflow.id,
        'Orchestration workflow or main Agent turn budget exhausted',
      );
    }
    const claimed = await this.db.transaction(async (db) => {
      const model = new OrchestrationWorkflowModel(db, this.userId, this.workspaceId);
      const fresh = await model.lockById(orchestrationWorkflow.id);
      if (
        !fresh ||
        !activeStatuses.has(fresh.status) ||
        fresh.config?.managerState?.token !== state?.token ||
        fresh.config?.managerState?.turns !== state?.turns ||
        (fresh.config?.managerState && !fresh.config.managerState.consumed)
      )
        return;
      const current = await this.graph(db).getGraph(orchestrationWorkflow.id);
      if (!current || managerSnapshot(current) !== managerSnapshot(graph)) return;
      if (
        (fresh.config?.managerState?.turns ?? 0) >= (fresh.config?.manager?.maxTurns ?? 12) ||
        (await this.budgetBlocked(current, db))
      )
        return;
      const topicId =
        state?.topicId ??
        (
          await new TopicModel(db, this.userId, this.workspaceId).create({
            agentId: policy.agentId,
            title: `Orchestration workflow management: ${orchestrationWorkflow.title}`,
          })
        ).id;
      const reviews = await this.reviews(current, db);
      const next: OrchestrationWorkflowManagerState = {
        ...(problem
          ? {
              problem: problemKey(problem),
              ...(problem.taskId && { problemTaskId: problem.taskId }),
            }
          : {}),
        reviewSnapshot: reviews.hash,
        topicId,
        turns: (state?.turns ?? 0) + 1,
        token: randomUUID(),
        snapshot: managerSnapshot(current),
        startedAt: new Date().toISOString(),
      };
      await this.save(db, orchestrationWorkflow.id, next);
      if (fresh.status === 'planning')
        await model.updateStatus(orchestrationWorkflow.id, 'running');
      return { ...next, reviewNotes: reviews.notes };
    });
    if (!claimed)
      return this.wait(orchestrationWorkflow.id, 'Another advance owns the planning turn');
    try {
      const result = await new AiAgentService(this.db, this.userId, {
        workspaceId: this.workspaceId,
      }).execAgent({
        agentId: policy.agentId,
        appContext: { topicId: claimed.topicId },
        clientIds: { userMessageId: `msg_orchestration_workflow_manager_${claimed.token}` },
        autoStart: true,
        maxSteps: 80,
        userInterventionConfig: { approvalMode: 'headless' },
        prompt: buildOrchestrationWorkflowManagerPrompt({
          orchestrationWorkflowId: orchestrationWorkflow.id,
          requirement: orchestrationWorkflow.requirement ?? orchestrationWorkflow.title,
          instruction: policy.instruction,
          token: claimed.token,
          feedback: claimed.reviewNotes,
          problem: problem?.reason,
        }),
      });
      await this.db.transaction(async (db) => {
        const fresh = await new OrchestrationWorkflowModel(
          db,
          this.userId,
          this.workspaceId,
        ).lockById(orchestrationWorkflow.id);
        if (fresh?.config?.managerState?.token === claimed.token) {
          await this.save(db, orchestrationWorkflow.id, {
            ...fresh.config.managerState,
            operationId: result.operationId,
          });
        }
      });
    } catch (error) {
      console.error(
        '[orchestration workflow:manager] dispatch failed; next wakeup adopts any persisted operation',
        error,
      );
    }
    return this.wait(orchestrationWorkflow.id, 'Main Agent dispatched with CLI planning access');
  };

  submit = async (
    orchestrationWorkflowId: string,
    token: string,
    operationId: string,
    input: OrchestrationWorkflowPlan,
  ) => {
    const plan = orchestrationWorkflowPlanSchema.parse(input);
    return this.db.transaction(async (db) => {
      const model = new OrchestrationWorkflowModel(db, this.userId, this.workspaceId);
      const orchestrationWorkflow = await model.lockById(orchestrationWorkflowId);
      const state = orchestrationWorkflow?.config?.managerState;
      if (!orchestrationWorkflow?.config?.manager || !state || state.token !== token)
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'This planning turn does not own the Orchestration workflow',
        });
      const op = await new AgentOperationModel(
        db,
        this.userId,
        this.workspaceId,
      ).findByTopicSourceMessage(state.topicId, `msg_orchestration_workflow_manager_${token}`);
      if (op?.id !== operationId || op.agentId !== orchestrationWorkflow.config.manager.agentId)
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Unrelated main Agent operation' });
      const graph = await this.graph(db).getGraph(orchestrationWorkflowId);
      if (
        !graph ||
        !activeStatuses.has(orchestrationWorkflow.status) ||
        graph.decisions.some((d) => d.status === 'pending')
      )
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Orchestration workflow stopped or awaiting human decision',
        });
      if (state.submitted) return { duplicate: true, plan: state.submitted };
      if (state.consumed || op.status !== 'running' || managerSnapshot(graph) !== state.snapshot)
        throw new TRPCError({ code: 'CONFLICT', message: 'Stale planning input; no plan applied' });
      if (state.reviewSnapshot && (await this.reviews(graph, db)).hash !== state.reviewSnapshot)
        throw new TRPCError({
          code: 'CONFLICT',
          message:
            'Task review feedback changed; exit without a plan so the next bounded turn can read it',
        });
      if (await this.budgetBlocked(graph, db))
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Orchestration workflow budget exhausted',
        });
      const authored = new OrchestrationWorkflowGraphModel(db, this.userId, this.workspaceId, {
        id: orchestrationWorkflow.config.manager.agentId,
        type: 'agent',
      });
      if (plan.action === 'patch') {
        const currentRevision = orchestrationWorkflow.config.caidPlan?.revision ?? 0;
        if (currentRevision !== plan.expectedPlanRevision)
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Stale plan revision: expected ${plan.expectedPlanRevision}, current ${currentRevision}`,
          });
        const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
        const keyToNodeId = new Map<string, string>();
        const pendingDeps: Array<{ sourceNodeId: string; target: string }> = [];
        for (const patch of plan.patches) {
          if (patch.op === 'append') {
            const node = await authored.createNode(orchestrationWorkflowId, {
              description: patch.task.description,
              kind: 'task',
              status: 'proposed',
              title: patch.task.title,
              createdByAgentId: orchestrationWorkflow.config.manager.agentId,
            });
            if (!node)
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to create plan node',
              });
            if (patch.key) {
              if (keyToNodeId.has(patch.key) || nodeById.has(patch.key))
                throw new TRPCError({
                  code: 'CONFLICT',
                  message: `Duplicate patch key "${patch.key}"`,
                });
              keyToNodeId.set(patch.key, node.id);
            }
            nodeById.set(node.id, node);
            for (const dep of new Set(patch.dependsOn ?? []))
              pendingDeps.push({ sourceNodeId: node.id, target: dep });
          } else {
            const node = nodeById.get(patch.nodeId);
            if (!node || node.kind !== 'task' || terminalNodes.has(node.status))
              throw new TRPCError({
                code: 'CONFLICT',
                message: `Node ${patch.nodeId} is missing, not a task, or already terminal`,
              });
            if (patch.op === 'replace') {
              if (contractFrozenNodes.has(node.status) || node.taskId)
                throw new TRPCError({
                  code: 'CONFLICT',
                  message: `Node ${patch.nodeId} is bound to a running contract; cancel or replan it instead of rewriting`,
                });
              if (!patch.title && !patch.description)
                throw new TRPCError({
                  code: 'BAD_REQUEST',
                  message: 'replace patch must set title or description',
                });
              await authored.updateNodeText(orchestrationWorkflowId, node.id, {
                description: patch.description,
                title: patch.title,
              });
            } else {
              const hasDependents =
                graph.edges.some(
                  (edge) => edge.kind === 'depends_on' && edge.targetNodeId === node.id,
                ) || pendingDeps.some((dep) => dep.target === node.id);
              if (hasDependents)
                throw new TRPCError({
                  code: 'CONFLICT',
                  message: `Node ${patch.nodeId} has dependents; retire their edges first`,
                });
              if (contractFrozenNodes.has(node.status) || node.taskId)
                throw new TRPCError({
                  code: 'CONFLICT',
                  message: `Node ${patch.nodeId} is bound to a running contract; cancel or replan it instead of retiring`,
                });
              await authored.updateNodeStatus(
                orchestrationWorkflowId,
                node.id,
                'retired',
                plan.reason,
              );
              nodeById.set(node.id, { ...node, status: 'retired' });
            }
          }
        }
        // dependsOn entries resolve as an existing node id or a `key` defined
        // by an earlier append in the same batch.
        for (const dep of pendingDeps) {
          const target = keyToNodeId.get(dep.target) ?? dep.target;
          const targetNode = nodeById.get(target);
          if (!targetNode || targetNode.kind !== 'task' || terminalNodes.has(targetNode.status))
            throw new TRPCError({
              code: 'CONFLICT',
              message: `dependsOn target "${dep.target}" is missing, not a task, or terminal`,
            });
          if (target === dep.sourceNodeId)
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'A task cannot depend on itself' });
          dep.target = target;
        }
        // Cycle check over depends_on edges including this batch.
        const adjacency = new Map<string, string[]>();
        for (const edge of graph.edges)
          if (edge.kind === 'depends_on')
            adjacency.set(edge.sourceNodeId, [
              ...(adjacency.get(edge.sourceNodeId) ?? []),
              edge.targetNodeId,
            ]);
        for (const dep of pendingDeps)
          adjacency.set(dep.sourceNodeId, [...(adjacency.get(dep.sourceNodeId) ?? []), dep.target]);
        for (const dep of pendingDeps) {
          const seen = new Set<string>();
          const stack = [...(adjacency.get(dep.target) ?? [])];
          while (stack.length) {
            const next = stack.pop()!;
            if (next === dep.sourceNodeId)
              throw new TRPCError({
                code: 'CONFLICT',
                message: 'dependsOn would create a dependency cycle',
              });
            if (seen.has(next)) continue;
            seen.add(next);
            stack.push(...(adjacency.get(next) ?? []));
          }
        }
        for (const dep of pendingDeps)
          await authored.createEdge(
            orchestrationWorkflowId,
            dep.sourceNodeId,
            dep.target,
            'depends_on',
          );
        // Bump the plan revision inside the same transaction: any stale
        // expectedPlanRevision observes the increment and is refused.
        await db
          .update(orchestrationWorkflows)
          .set({
            config: sql`jsonb_set(COALESCE(${orchestrationWorkflows.config}, '{}'::jsonb), '{caidPlan}', ${JSON.stringify({ revision: currentRevision + 1 })}::jsonb)`,
            updatedAt: new Date(),
          })
          .where(eq(orchestrationWorkflows.id, orchestrationWorkflowId));
        await this.save(db, orchestrationWorkflowId, {
          ...state,
          operationId,
          submitted: { action: plan.action, reason: plan.reason },
        });
        return { recorded: true, action: plan.action };
      }
      const unfinished = graph.nodes.filter(
        (n) => n.kind === 'task' && !terminalNodes.has(n.status),
      );
      // A takeover of the terminal acceptance can only be answered with `escalate`.
      // The acceptance task is matched by TITLE regardless of status, so a corrective
      // task returns to that same failed node and `verify` sets `readyForAcceptance`
      // without producing a fresh run — both end at the Gate. Refusing here keeps the
      // prompt's offer and the server's answer the same; letting the acceptance be
      // superseded is a lifecycle change, not a validation one.
      if (
        state.problem &&
        (plan.action === 'tasks' || plan.action === 'verify') &&
        graph.nodes.some(
          (n) =>
            n.kind === 'task' &&
            n.taskId === state.problemTaskId &&
            n.title === ORCHESTRATION_WORKFLOW_ACCEPTANCE_TASK_TITLE,
        )
      )
        throw new TRPCError({
          code: 'CONFLICT',
          message:
            'A failed Orchestration workflow acceptance can only be escalated; it cannot be superseded by new work yet',
        });
      // The unfinished-work guard asks whether an UNINVITED turn may plan while
      // work is in flight; it would double-plan the frontier. A takeover turn
      // inherits work that is stuck by definition — the coordinator only handed it
      // over because nothing else moves it — so a corrective task is the answer
      // rather than the thing to forbid. Without this exemption the prompt
      // advertises four actions and only `escalate` can ever commit.
      if (
        (plan.action === 'tasks' || plan.action === 'verify') &&
        ((unfinished.length && !state.problem) ||
          (plan.action === 'verify' &&
            !graph.nodes.some((n) => n.kind === 'task' && n.status === 'resolved')))
      )
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Existing work must be delivered before planning or verification',
        });
      // Accepting a plan that REPLACES the inherited work has to settle it too.
      // Validation alone was not enough: the blocked node stayed nonterminal, so
      // the next tick's frontier reached it before the corrective node and routed
      // straight back to the Gate, and terminal verification could not start at
      // all. Retiring is the same move the human Gate offers, scoped to the one
      // node this turn was invited about and attributed to the Agent.
      if (
        state.problem &&
        state.problemTaskId &&
        (plan.action === 'tasks' || plan.action === 'verify')
      ) {
        const inherited = graph.nodes.find(
          (n) => n.kind === 'task' && n.taskId === state.problemTaskId,
        );
        // A prerequisite only counts as met when it is `resolved`, so retiring a node
        // that something depends on leaves the dependent blocked forever and the OrchestrationWorkflow
        // lands on `no_frontier`. Rewiring the dependents onto the replacement would
        // be the answer, but the graph has no edge removal, so the old edge would keep
        // pointing at the retired node. Leave it alone and let the Gate handle it.
        const hasDependents =
          inherited &&
          graph.edges.some(
            (edge) => edge.kind === 'depends_on' && edge.targetNodeId === inherited.id,
          );
        if (inherited && !hasDependents && !terminalNodes.has(inherited.status))
          await authored.updateNodeStatus(
            orchestrationWorkflowId,
            inherited.id,
            'retired',
            plan.reason,
          );
      }
      if (plan.action === 'tasks') {
        const problem = graph.nodes.find((n) => n.kind === 'problem');
        for (const task of plan.tasks) {
          const node = await authored.createNode(orchestrationWorkflowId, {
            ...task,
            kind: 'task',
            status: 'proposed',
            createdByAgentId: orchestrationWorkflow.config.manager.agentId,
          });
          if (node && problem)
            await authored.createEdge(orchestrationWorkflowId, problem.id, node.id, 'decomposes');
        }
      } else if (plan.action === 'retry') {
        const node = unfinished.find((n) => n.taskId === plan.taskId);
        const task = node
          ? await new TaskModel(db, this.userId, this.workspaceId).findById(plan.taskId)
          : undefined;
        const runs = task
          ? await new TaskTopicModel(db, this.userId, this.workspaceId).findByTaskId(task.id)
          : [];
        const failure = runs[0]?.operationId
          ? await new AgentOperationModel(db, this.userId, this.workspaceId).findById(
              runs[0].operationId,
            )
          : undefined;
        if (
          !task ||
          runs[0]?.operationId !== plan.failedOperationId ||
          !recoveryEligibility(graph, task, failure).eligible
        )
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Failure identity or retry eligibility changed',
          });
        if (
          !(await new TaskModel(db, this.userId, this.workspaceId).updateStatusIfCurrent(
            task.id,
            'failed',
            'backlog',
            { error: null },
          ))
        )
          throw new TRPCError({ code: 'CONFLICT', message: 'Task changed before retry' });
      } else if (plan.action === 'escalate' && !state.problem) {
        // Only an ORDINARY planning turn pauses the OrchestrationWorkflow here. A takeover turn has
        // a gate waiting behind it for this exact problem, and the coordinator
        // opens that gate on the next tick — a paused OrchestrationWorkflow would stop the tick from
        // ever reaching it, leaving the escalation with no answerable question.
        await model.updateStatus(orchestrationWorkflowId, 'paused');
        await authored.recordOrchestrationWorkflowStatus(
          orchestrationWorkflowId,
          orchestrationWorkflow.status,
          'paused',
          plan.reason,
        );
      }
      await this.save(db, orchestrationWorkflowId, {
        ...state,
        operationId,
        submitted: {
          action: plan.action,
          reason: plan.reason,
          ...(plan.action === 'retry' ? { taskId: plan.taskId } : {}),
        },
        readyForAcceptance: plan.action === 'verify',
      });
      return { recorded: true, action: plan.action };
    });
  };
}
