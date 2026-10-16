import type {
  OrchestrationWorkflowAdvanceEffect,
  OrchestrationWorkflowMetricCriteriaState,
} from '@orvilo/agent-tracing';
import { buildOrchestrationWorkflowRequirement } from '@orvilo/builtin-tool-orchestration-workflow';
import { ORCHESTRATION_WORKFLOW_COORDINATOR_ACTOR_ID } from '@orvilo/const/orchestrationWorkflow';
import type {
  MetricKind,
  OrchestrationWorkflowConfig,
  OrchestrationWorkflowCreateConfig,
  OrchestrationWorkflowEdgeKind,
  OrchestrationWorkflowGraphNode,
  OrchestrationWorkflowGraphSnapshot,
  OrchestrationWorkflowItem,
  OrchestrationWorkflowMetricCriterion,
  OrchestrationWorkflowNodeAcceptance,
  OrchestrationWorkflowNodeIntegration,
  OrchestrationWorkflowNodeKind,
  OrchestrationWorkflowNodeStatus,
  OrchestrationWorkflowPauseReason,
  OrchestrationWorkflowStatus,
  OrchestrationWorkflowTickResult,
  TaskItem,
  TaskTopicHandoff,
  WorkVersionEventItem,
} from '@orvilo/types';
import { experimentOwner, provenanceParentId } from '@orvilo/utils/orchestrationWorkflowGraph';
import { TRPCError } from '@trpc/server';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { AgentModel } from '@/database/models/agent';
import { AgentOperationModel } from '@/database/models/agentOperation';
import { MetricModel } from '@/database/models/metric';
import { OrchestrationWorkflowModel } from '@/database/models/orchestrationWorkflow';
import { OrchestrationWorkflowGraphModel } from '@/database/models/orchestrationWorkflowGraph';
import { ProjectModel } from '@/database/models/project';
import { TaskModel } from '@/database/models/task';
import { TaskDispatchModel } from '@/database/models/taskDispatch';
import { ACTIVE_DISPATCH_PHASES } from '@/database/models/taskExecutionSql';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { WorkModel } from '@/database/models/work';
import { taskDispatches } from '@/database/schemas/task';
import type { OrviloDatabase } from '@/database/type';
import {
  assertAgentUsableBy,
  findUsableAgentExecutionBinding,
} from '@/database/utils/agent-access';
import { isCaidDispatchAllowed } from '@/server/featureFlags/caidAdmission';
import { createAgentStateManager } from '@/server/modules/AgentExecution/factory';
import { agentCanMountBuiltinToolSurface } from '@/server/services/aiAgent/pipeline/resolveExecutionBinding';
import { isAcpJudgmentBindingError } from '@/server/services/aiGeneration/judgment';

import { TaskService } from '../task';
import { TaskRunnerService } from '../taskRunner';
import { taskRunIdempotencyKey } from '../taskRunner/idempotency';
import { taskRequiresBuiltinToolMount } from '../taskRunner/toolMountRequirement';
import { settleTaskExecution } from '../taskSettlement';
import { AcceptanceService } from '../verify/acceptanceService';
import { VerifyPlanGeneratorService } from '../verify/planGenerator';
import {
  OrchestrationWorkflowCriteriaGeneratorService,
  type OrchestrationWorkflowDecompositionDraft,
} from './criteriaGenerator';
import {
  compareMetric,
  decideNextMove,
  frontierNeedsBudget,
  LEASE_EXPIRED_ERROR,
  MEASURED_ACCEPTANCE_PAUSE_REASON,
  needsMetricCriteria,
  ORCHESTRATION_WORKFLOW_ACCEPTANCE_TASK_TITLE,
  type OrchestrationWorkflowMove,
  selectFrontier,
  TERMINAL_NODE_STATUSES,
} from './decideNextMove';
import { experimentResults, exploreGraph } from './exploreGraph';
import { answeredProblem, OrchestrationWorkflowManagerService, problemKey } from './manager';
import {
  resolveMaxConcurrentTasks,
  resolveOperationLeaseTimeout,
  resolveTaskMaxSteps,
  VERIFY_SETTLE_GRACE_MS,
} from './recoveryPolicy';
import { OrchestrationWorkflowSupervisorService } from './supervisor';
import { claimOrchestrationWorkflowTask } from './taskClaim';
import { TaskRecoveryCoordinator } from './taskRecoveryCoordinator';
import {
  type OrchestrationWorkflowTickOptions,
  toBudgetState,
  toFrontierTaskState,
  toTraceGraphState,
} from './traceObservation';

const TASK_NODE_CLAIM_TTL_MS = 5 * 60 * 1000;
const TASK_DESCRIPTION_MAX_LENGTH = 255;
/** Advisory-lock namespace for orchestration workflow dispatch. `0x676f_6469` is ASCII `godi`. */
const ORCHESTRATION_WORKFLOW_DISPATCH_LOCK_NAMESPACE = 0x67_6f_64_69;

export interface CreateOrchestrationWorkflowTaskInput {
  description?: string;
  title: string;
}

export interface CreateOrchestrationWorkflowGraphInput {
  agentId?: string;
  config?: OrchestrationWorkflowCreateConfig;
  /**
   * The agent that made this call, when a tool did. Distinct from `agentId`,
   * which is the agent the orchestration workflow is assigned to — creating a orchestration workflow from the modal
   * on an agent's page sets that, but the author is still the person.
   */
  createdByAgentId?: string;
  /**
   * Structured acceptance criteria. Persisted as `verify_criteria` rows and
   * recorded on `config.acceptance.criteriaIds`, so the orchestration workflow page can show and
   * edit them and the terminal OrchestrationWorkflow-acceptance Task verifies against exactly
   * these checks. Callers still fold the same criteria into `requirement`
   * prose — that text remains what every Task's execution context reads.
   */
  criteria?: Array<{ description?: string; instruction?: string; title: string }>;
  maxRounds?: number;
  maxTotalCost?: number;
  /**
   * The user's ask in their own words, shown on the seeded problem node. The
   * full `requirement` (with its acceptance boilerplate) stays on the orchestration workflow row
   * — copying it onto the node made every drill-down read like a contract.
   */
  problemDescription?: string;
  projectId?: string;
  requirement?: string;
  /**
   * Seed task nodes, in dependency-free order. A plain string is title-only.
   * When omitted, the coordinator plans the decomposition on first advance.
   */
  tasks?: Array<CreateOrchestrationWorkflowTaskInput | string>;
  title: string;
}

export interface CreateOrchestrationWorkflowNodeInput {
  description?: string;
  kind: OrchestrationWorkflowNodeKind;
  priority?: number;
  questionId?: string;
  scopeId?: string;
  status?: OrchestrationWorkflowNodeStatus;
  title: string;
}

/** Application service shared by CLI today and Graph UI/schedulers later. */
/**
 * Version events read per task run when harvesting deliverables. Generous
 * because the cap applies to events rather than to Works: the newest N events
 * of a run must still contain every Work it produced, even one revised many
 * times over.
 */
const DELIVERABLE_EVENTS_PER_RUN = 200;

export class OrchestrationWorkflowService {
  private readonly acceptanceService: AcceptanceService;
  private readonly orchestrationWorkflowModel: OrchestrationWorkflowModel;
  /**
   * Graph writes attributed to the person who asked for them: seeding a orchestration workflow,
   * adding a node or edge by hand, resolving a decision gate.
   */
  private readonly graphModel: OrchestrationWorkflowGraphModel;
  /**
   * Graph writes the coordinator makes on its own — claiming a Task node,
   * binding its task, synthesizing a finding, opening a gate. Attributed to the coordinator
   * even when a person pressed Advance: they asked it to run, they did not make
   * these moves.
   */
  private readonly coordinatorGraph: OrchestrationWorkflowGraphModel;
  private readonly taskModel: TaskModel;
  private readonly taskService: TaskService;
  private readonly taskTopicModel: TaskTopicModel;
  private readonly workModel: WorkModel;

  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {
    this.acceptanceService = new AcceptanceService(db, userId, workspaceId);
    this.orchestrationWorkflowModel = new OrchestrationWorkflowModel(db, userId, workspaceId);
    this.graphModel = new OrchestrationWorkflowGraphModel(db, userId, workspaceId);
    this.coordinatorGraph = new OrchestrationWorkflowGraphModel(db, userId, workspaceId, {
      id: ORCHESTRATION_WORKFLOW_COORDINATOR_ACTOR_ID,
      type: 'system',
    });
    this.taskModel = new TaskModel(db, userId, workspaceId);
    this.taskService = new TaskService(db, userId, workspaceId);
    this.taskTopicModel = new TaskTopicModel(db, userId, workspaceId);
    this.workModel = new WorkModel(db, userId, workspaceId);
  }

  /**
   * The graph model whose audit trail names `agentId` as the author, or the
   * user-attributed one when a person is calling.
   */
  private graphAs = (agentId?: string) =>
    agentId
      ? new OrchestrationWorkflowGraphModel(this.db, this.userId, this.workspaceId, {
          id: agentId,
          type: 'agent',
        })
      : this.graphModel;

  /**
   * The agent a orchestration workflow binds to executes every Task the coordinator creates —
   * orchestration workflow-mode work whose contract always requires the builtin/MCP tool
   * surface. Binding a mount-incapable engine would mint dispatches that can
   * only throw at admission, so binding refuses it up front (visibility is
   * checked by the same lookup; a missing agent is still NOT_FOUND).
   */
  private assertOrchestrationWorkflowAgentMountCapable = async (agentId: string) => {
    const binding = await findUsableAgentExecutionBinding(this.db, agentId, {
      userId: this.userId,
      workspaceId: this.workspaceId,
    });
    if (!binding) throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' });
    if (!agentCanMountBuiltinToolSurface({ agencyConfig: binding.agencyConfig }, binding.model)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'The selected agent cannot run orchestration workflow tasks: its engine cannot mount the builtin tool ' +
          'surface orchestration workflow work requires (acceptance evidence). Choose an agent on an ' +
          'MCP-mount-capable runtime.',
      });
    }
  };

  create = async (
    input: CreateOrchestrationWorkflowGraphInput,
  ): Promise<OrchestrationWorkflowGraphSnapshot> => {
    if (input.projectId) {
      const project = await new ProjectModel(
        this.db,
        this.userId,
        this.workspaceId,
      ).findManageableById(input.projectId);
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
    }
    // Persist the structured acceptance criteria first: their ids ride on the
    // orchestration workflow config so the page can edit them and the terminal acceptance Task
    // is gated on exactly these checks (not an AI re-derivation of the prose).
    const creatorAgentId = await new AgentModel(
      this.db,
      this.userId,
      this.workspaceId,
    ).getOrchestratorSourceAgentId();
    if (input.createdByAgentId && input.createdByAgentId !== creatorAgentId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'ORCHESTRATOR_REQUIRED' });
    }
    // The orchestration workflow-bound agent executes every Task this orchestration workflow mints — orchestration workflow-mode
    // work whose contract always requires the builtin tool surface. The gate
    // covers the *resolved* binding (`input.agentId ?? creatorAgentId`), and
    // subsumes the visibility assert for `input.agentId`.
    const boundAgentId = creatorAgentId;
    if (boundAgentId) await this.assertOrchestrationWorkflowAgentMountCapable(boundAgentId);
    const {
      manager: managerOptions,
      planConfirmedAt: _confirmation,
      conversationPlan: _conversation,
      ...options
    } = (input.config ?? {}) as OrchestrationWorkflowConfig;
    const managed = managerOptions !== undefined;
    let config: OrchestrationWorkflowConfig | undefined = input.config ? options : undefined;
    if (managed) {
      if (!creatorAgentId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'A main Agent requires the creating or selected Agent',
        });
      }
      const turns = managerOptions?.maxTurns ?? 12;
      if (!Number.isInteger(turns) || turns < 1 || turns > 100)
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Main Agent requires 1–100 management turns',
        });
      // Exploration, supervision and seed tasks used to be rejected here, on the
      // premise that a main Agent owns planning outright. They are layers, not
      // rivals: the system planner leads, supervision recovers known transport
      // failures, and the main Agent is handed whatever neither can route (see
      // `gateOrTakeOver`). Ordering resolves what exclusivity used to.
      await assertAgentUsableBy(this.db, creatorAgentId, {
        userId: this.userId,
        workspaceId: this.workspaceId,
      });
      config = { ...options, manager: { ...managerOptions, agentId: creatorAgentId } };
    }
    // A supplied requirement is the user-reviewed orchestration workflow document. Criteria live
    // separately; only synthesize a document when the caller omitted one.
    const requirement =
      input.requirement ??
      (input.criteria?.length
        ? buildOrchestrationWorkflowRequirement(input.title, input.criteria)
        : undefined) ??
      (input.config?.exploration ? input.title : undefined);
    if (config?.exploration) {
      const { maxExperiments, instruction } = config.exploration;
      if (
        !Number.isInteger(maxExperiments) ||
        maxExperiments < 1 ||
        maxExperiments > 200 ||
        !instruction.trim()
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Exploration requires an instruction and 1–200 experiments',
        });
      }
      if ((input.tasks?.length ?? 0) > maxExperiments) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Initial tasks exceed the experiment limit',
        });
      }
      config = { ...config, exploration: { maxExperiments, instruction } };
    }
    if (input.criteria?.length) {
      const criteriaIds = await new VerifyPlanGeneratorService(
        this.db,
        this.userId,
        this.workspaceId,
      ).createCriteriaFromDrafts(
        input.criteria.map((item) => ({
          description: item.description,
          instruction: item.instruction,
          onFail: 'manual',
          required: true,
          title: item.title,
          verifierType: 'agent',
        })),
      );
      // Merge, never replace: `acceptance` also carries the numeric clauses,
      // and rebuilding the object from `criteriaIds` alone would drop a
      // measured gate the caller asked for in the same call.
      config = { ...config, acceptance: { ...config?.acceptance, criteriaIds } };
    }

    const orchestrationWorkflow = await this.orchestrationWorkflowModel.create({
      agentId: creatorAgentId,
      config,
      maxRounds: input.maxRounds,
      maxTotalCost: input.maxTotalCost,
      projectId: input.projectId,
      requirement,
      subjectType: 'standalone',
      title: input.title,
    });
    // `/orchestration workflow` is an agent making the call. Seeding through the user-attributed
    // model would file the whole opening graph under the orchestration workflow's owner, which is
    // the same loss of authorship the coordinator split just fixed.
    const authorGraph = this.graphAs(input.createdByAgentId);

    try {
      const problem = await authorGraph.createNode(orchestrationWorkflow.id, {
        createdByAgentId: input.createdByAgentId,
        description: input.problemDescription ?? input.requirement,
        kind: 'problem',
        status: 'active',
        title: input.title,
      });
      if (!problem) throw new Error('Failed to seed orchestration workflow problem');

      // An exploration baseline is the orchestration workflow's first candidate answer, so it
      // lives inside an experiment container the explorer can branch from.
      // Caller-supplied seed tasks are ordinary work: they attach straight to
      // the problem the way a planned or manager-submitted task does.
      if (config?.exploration && !input.tasks) {
        const description = `Produce one initial baseline experiment for this Orchestration workflow. ${input.problemDescription ?? requirement ?? input.title}\nExploration method: ${config.exploration.instruction}\nExecute the baseline only; later experiments are scheduled by the Orchestration workflow coordinator. Include a self-contained result and evidence.`;
        const experiment = await authorGraph.createNode(orchestrationWorkflow.id, {
          kind: 'experiment',
          title: input.title,
          description,
          questionId: problem.id,
          createdByAgentId: input.createdByAgentId,
        });
        if (!experiment) throw new Error('Failed to seed experiment');
        const taskNode = await authorGraph.createNode(orchestrationWorkflow.id, {
          scopeId: experiment.id,
          createdByAgentId: input.createdByAgentId,
          description,
          kind: 'task',
          title: input.title,
        });
        if (!taskNode) throw new Error('Failed to seed orchestration workflow task');
      }
      for (const seed of input.tasks ?? []) {
        const { description, title } = typeof seed === 'string' ? { title: seed } : seed;
        const taskNode = await authorGraph.createNode(orchestrationWorkflow.id, {
          createdByAgentId: input.createdByAgentId,
          description,
          kind: 'task',
          title,
        });
        if (!taskNode) throw new Error('Failed to seed orchestration workflow task');
        await authorGraph.createEdge(
          orchestrationWorkflow.id,
          problem.id,
          taskNode.id,
          'decomposes',
        );
      }
    } catch (error) {
      await this.orchestrationWorkflowModel.delete(orchestrationWorkflow.id).catch(() => {});
      throw error;
    }
    return (await this.graphModel.getGraph(orchestrationWorkflow.id))!;
  };

  /**
   * Replace the orchestration workflow's structured acceptance criteria id list (orchestration workflow-page
   * editing). The criteria rows themselves are edited through the verify
   * criteria endpoints; this only rebinds which of them gate the orchestration workflow.
   */
  /**
   * Declare (or clear) the numeric clauses that gate this orchestration workflow's acceptance.
   *
   * Merged into `config.acceptance` so it cannot clobber the delivery criteria
   * binding, and settable after creation because a long-horizon orchestration workflow learns its
   * real thresholds while it runs. Relaxing a clause can unblock a orchestration workflow that is
   * already parked short of acceptance — the same reason extending a deadline
   * resumes a budget-stopped one — so the caller schedules an advance.
   */
  /**
   * Write a measurement against this orchestration workflow, and reopen it when that measurement
   * is what it was waiting for.
   *
   * The gate parks the orchestration workflow (see the `measured_acceptance` branch), and `tick`
   * refuses to move a paused orchestration workflow — so without the reopen here the observation
   * would land and nothing would happen. Only a orchestration workflow the gate actually stopped
   * is reopened, and only once every clause holds: the same discipline
   * `setBudget` uses, so a deliberate pause is never undone by a stray sample
   * and a still-short measurement does not queue a no-op advance.
   */
  recordObservation = async (
    orchestrationWorkflowId: string,
    input: {
      key: string;
      kind?: MetricKind;
      observedAt?: Date;
      title?: string;
      unit?: string;
      value: number;
    },
  ) => {
    const orchestrationWorkflow =
      await this.orchestrationWorkflowModel.findById(orchestrationWorkflowId);
    if (!orchestrationWorkflow)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchestration workflow not found' });

    const metricModel = new MetricModel(this.db, this.userId, this.workspaceId);
    const series = await metricModel.ensure({
      key: input.key,
      kind: input.kind,
      subjectId: orchestrationWorkflow.id,
      subjectType: 'orchestrationWorkflow',
      title: input.title,
      unit: input.unit,
    });
    if (!series)
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Metric series slot is owned by another scope',
      });

    const point = await metricModel.addPoint(series.id, {
      actorId: this.userId,
      actorType: 'user',
      observedAt: input.observedAt ?? new Date(),
      sourceType: 'manual',
      value: input.value,
    });

    return {
      point,
      series,
      shouldAdvance: await this.reopenIfMeasurementCleared(orchestrationWorkflowId),
    };
  };

  /**
   * Whether the coordinator is worth waking: either the orchestration workflow is already
   * running, or the coordinator itself parked it on a measured gate that no
   * longer holds it.
   *
   * The `pausedBy` marker is what makes this safe. A orchestration workflow paused by a person
   * looks exactly like one parked by the gate — same status, same terminal
   * phase, same clauses — so without it an arriving measurement would restart
   * a orchestration workflow somebody deliberately stopped.
   *
   * "No longer holds it" covers both ways out: every clause now satisfied, and
   * the clauses being dropped altogether (`setMetricCriteria(id, [])`), which
   * otherwise left the orchestration workflow parked on a gate that no longer existed.
   */
  private reopenIfMeasurementCleared = async (
    orchestrationWorkflowId: string,
    /**
     * Whether the gate held the orchestration workflow *before* the caller's edit, for callers
     * that change the clauses themselves: dropping the last one erases the
     * evidence, so the verdict is taken from the state that preceded it — the
     * same way `setBudget` reads what was binding before it wrote.
     */
    parkedBeforeEdit?: boolean,
  ): Promise<boolean> => {
    const graph = await this.coordinatorGraph.getGraph(orchestrationWorkflowId);
    if (!graph) return false;
    if (graph.orchestrationWorkflow.status !== 'paused') return true;
    if (!(parkedBeforeEdit ?? this.isParkedOnMeasuredGate(graph))) return false;

    if (needsMetricCriteria(graph)) {
      const { allMet } = await this.evaluateMetricCriteria(graph);
      if (!allMet) return false;
    }

    await this.setPauseReason(orchestrationWorkflowId, undefined);
    await this.transitionStatus(
      graph.orchestrationWorkflow,
      'running',
      'a measurement cleared the acceptance gate',
    );
    return true;
  };

  /**
   * Record (or clear) why the coordinator is holding this orchestration workflow paused.
   *
   * Kept on the orchestration workflow's JSONB config rather than derived from the event log:
   * control flow should not depend on a capped audit trail, and the marker has
   * to survive for as long as the pause does — which for a long-horizon orchestration workflow
   * is the whole wait.
   */
  private setPauseReason = async (
    orchestrationWorkflowId: string,
    reason: OrchestrationWorkflowPauseReason | undefined,
  ) => {
    await this.orchestrationWorkflowModel.updatePauseReason(orchestrationWorkflowId, reason);
  };

  /**
   * Whether the coordinator is the one holding this paused orchestration workflow.
   *
   * The marker answers it outright. OrchestrationWorkflows parked before the marker existed —
   * and any parked by an old worker mid-deploy — carry none, so fall back to
   * who performed the transition: every status change records a orchestration workflow-entity
   * event, and the newest one is by definition the transition that produced
   * the current status. A coordinator park is attributed to `system`, a user
   * pause to `user`, so the two stay distinguishable without the marker.
   *
   * Absent both, the pause is left alone: a orchestration workflow wrongly resumed spends money
   * against an explicit human decision, while one left parked says so on its
   * row and is one Resume away.
   */
  private isParkedOnMeasuredGate = (graph: OrchestrationWorkflowGraphSnapshot): boolean => {
    if (graph.orchestrationWorkflow.status !== 'paused') return false;
    if (graph.orchestrationWorkflow.config?.pausedBy)
      return graph.orchestrationWorkflow.config.pausedBy === 'measured_acceptance';

    // Match the park this gate actually recorded, not merely "the coordinator
    // paused it": it also parks orchestration workflows that are blocked or out of budget, and an
    // unrelated sample must not restart either. The newest orchestration workflow-entity event is
    // by definition the transition that produced the current status; if two
    // share a millisecond and the read picks the other one, the result is a
    // missed reopen rather than a wrongful one.
    const lastTransition = graph.events.find(
      (event) => event.entityType === 'orchestrationWorkflow',
    );
    return (
      lastTransition?.actorType !== 'user' &&
      !!lastTransition?.reason?.startsWith(MEASURED_ACCEPTANCE_PAUSE_REASON) &&
      needsMetricCriteria(graph)
    );
  };

  setMetricCriteria = async (
    orchestrationWorkflowId: string,
    metrics: OrchestrationWorkflowMetricCriterion[],
    /**
     * `merge` upserts by key into the list as it stands on the server —
     * for callers declaring one clause, whose own snapshot may be stale.
     * A client-built replacement array would silently drop whatever a
     * concurrent editor or agent declared since that snapshot was read.
     */
    mode: 'merge' | 'replace' = 'replace',
  ) => {
    const before = await this.coordinatorGraph.getGraph(orchestrationWorkflowId);
    if (!before)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchestration workflow not found' });
    const parkedOnGate = this.isParkedOnMeasuredGate(before);
    const orchestrationWorkflow = before.orchestrationWorkflow;
    const current = orchestrationWorkflow.config?.acceptance?.metrics ?? [];
    const next =
      mode === 'merge'
        ? [...current.filter((item) => !metrics.some((m) => m.key === item.key)), ...metrics]
        : metrics;
    await this.orchestrationWorkflowModel.update(orchestrationWorkflowId, {
      config: {
        ...orchestrationWorkflow.config,
        acceptance: {
          ...orchestrationWorkflow.config?.acceptance,
          metrics: next.length > 0 ? next : undefined,
        },
      },
    });
    // Relaxing or dropping a clause can clear a gate the orchestration workflow is parked on.
    await this.reopenIfMeasurementCleared(orchestrationWorkflowId, parkedOnGate);
    return this.graph(orchestrationWorkflowId);
  };

  setAcceptanceCriteria = async (orchestrationWorkflowId: string, criteriaIds: string[]) => {
    const orchestrationWorkflow =
      await this.orchestrationWorkflowModel.findById(orchestrationWorkflowId);
    if (!orchestrationWorkflow)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchestration workflow not found' });
    await this.orchestrationWorkflowModel.update(orchestrationWorkflowId, {
      config: {
        ...orchestrationWorkflow.config,
        acceptance: { ...orchestrationWorkflow.config?.acceptance, criteriaIds },
      },
    });

    // A terminal OrchestrationWorkflow-acceptance Task may already be dispatched — its
    // Acceptance row snapshotted the previous id list. Rebind it too, or the
    // page would present the new criteria as gates while the verifier keeps
    // materializing plans from the stale list. A verify round already
    // materialized for an in-flight run stays as-is (rounds are immutable
    // snapshots); every later run instantiates from the updated config.
    const graph = await this.graphModel.getGraph(orchestrationWorkflowId);
    const terminalTaskId = graph?.nodes.find(
      (node) =>
        node.kind === 'task' &&
        node.title === ORCHESTRATION_WORKFLOW_ACCEPTANCE_TASK_TITLE &&
        node.taskId,
    )?.taskId;
    if (!terminalTaskId) return;

    const acceptance = await this.acceptanceService.acceptanceModel.findBySubject(
      'task',
      terminalTaskId,
    );
    if (!acceptance || acceptance.status === 'accepted') return;
    await this.acceptanceService.acceptanceModel.update(acceptance.id, {
      config: {
        ...acceptance.config,
        ...(criteriaIds.length > 0
          ? { verifyCriteriaIds: criteriaIds }
          : { verifyCriteriaIds: undefined }),
      },
    });
  };

  graph = async (orchestrationWorkflowId: string) => {
    const graph = await this.requireGraph(orchestrationWorkflowId);
    const [runHeartbeats, deliveredAt, acceptances, integrations, spend, admitted] =
      await Promise.all([
        this.collectRunHeartbeats(graph),
        this.collectDeliveredAt(graph),
        this.collectAcceptances(graph),
        this.collectIntegrations(graph),
        this.resolveSpend(graph),
        isCaidDispatchAllowed({ userId: this.userId, workspaceId: this.workspaceId }),
      ]);
    return {
      ...graph,
      acceptances,
      deliveredAt,
      integrations,
      runHeartbeats,
      spend,
      orchestrationAdmission: admitted ? ('enabled' as const) : ('disabled' as const),
      orchestrationAdmissionReason: admitted ? null : ('caid_dispatch_disabled' as const),
    };
  };

  /**
   * Verification state per task node.
   *
   * Every dispatched task already owns an Acceptance (`createResponsibleTask`
   * creates one), but the orchestration workflow surfaced only the criteria it would be judged
   * against — never the judgment. A reader could see that a task finished and
   * still have no idea whether it held up, which is the gap that made the page
   * feel unverifiable.
   */
  private collectAcceptances = async (
    graph: OrchestrationWorkflowGraphSnapshot,
  ): Promise<Record<string, OrchestrationWorkflowNodeAcceptance> | undefined> => {
    const taskNodes = graph.nodes.filter(
      (node): node is OrchestrationWorkflowGraphNode & { taskId: string } =>
        node.kind === 'task' && !!node.taskId,
    );
    if (taskNodes.length === 0) return undefined;

    const nodeByTaskId = new Map(taskNodes.map((node) => [node.taskId, node.id]));
    const rows = await this.acceptanceService.acceptanceModel.findBySubjects(
      'task',
      taskNodes.map((node) => node.taskId),
    );

    const result: Record<string, OrchestrationWorkflowNodeAcceptance> = {};
    for (const row of rows) {
      const nodeId = nodeByTaskId.get(row.subjectId);
      if (!nodeId) continue;
      result[nodeId] = { id: row.id, status: row.status };
    }
    return Object.keys(result).length > 0 ? result : undefined;
  };

  /**
   * Newest integration record per task node.
   *
   * `collectDeliveredAt` covers the acceptance wait; this covers what comes
   * after — the run's branch making it back onto the base branch. A child
   * completing is not its work landing: without these records the map reads a
   * resolved node as delivered while its merge is still in flight, conflicted,
   * or blocked, and "awaiting integration" has no evidence anywhere on the
   * orchestration workflow. `skipped` means the run had nothing to integrate, so it is the one
   * state dropped; everything else (including `pending` on a run in flight)
   * is a state a reader can act on.
   */
  private collectIntegrations = async (
    graph: OrchestrationWorkflowGraphSnapshot,
  ): Promise<Record<string, OrchestrationWorkflowNodeIntegration> | undefined> => {
    const taskNodes = graph.nodes.filter(
      (node): node is OrchestrationWorkflowGraphNode & { taskId: string } =>
        node.kind === 'task' && !!node.taskId,
    );
    if (taskNodes.length === 0) return undefined;

    const nodeByTaskId = new Map(taskNodes.map((node) => [node.taskId, node.id]));
    // Newest run per task wins — `findWithHandoffByTaskIds` orders by seq
    // desc, and an older run's record is history once a newer one exists.
    const topics = await this.taskTopicModel.findWithHandoffByTaskIds(
      taskNodes.map((n) => n.taskId),
      taskNodes.length * 4,
    );

    const integrations: Record<string, OrchestrationWorkflowNodeIntegration> = {};
    const seen = new Set<string>();
    for (const topic of topics) {
      const taskId = topic.sourceTaskId;
      if (!taskId || seen.has(taskId)) continue;
      seen.add(taskId);
      const nodeId = nodeByTaskId.get(taskId);
      const integration = topic.integration;
      if (!nodeId || !integration || !topic.topicId || integration.state === 'skipped') continue;
      integrations[nodeId] = { ...integration, topicId: topic.topicId };
    }

    return Object.keys(integrations).length > 0 ? integrations : undefined;
  };

  /**
   * When an active task node's newest run delivered, for the nodes waiting on
   * verification to settle.
   *
   * A verify-bound task keeps its node `active` while its topic is already
   * `completed`, and the judgment is a full agent run that routinely outlives
   * the operation lease — `decideNextMove` holds off re-dispatching such a node
   * for a whole `VERIFY_SETTLE_GRACE_MS`. But a completed topic is not a
   * *running* one, so it contributes no heartbeat, and a client judging
   * liveness from heartbeats alone declared the orchestration workflow's most informative moment
   * — delivered, being verified — lost. Reporting the delivery instant lets the
   * client name that state and apply the coordinator's own grace window instead
   * of the lease.
   */
  private collectDeliveredAt = async (
    graph: OrchestrationWorkflowGraphSnapshot,
  ): Promise<Record<string, Date> | undefined> => {
    const activeTasks = graph.nodes.filter(
      (node): node is OrchestrationWorkflowGraphNode & { taskId: string } =>
        node.kind === 'task' && node.status === 'active' && !!node.taskId,
    );
    if (activeTasks.length === 0) return undefined;

    const nodeByTaskId = new Map(activeTasks.map((node) => [node.taskId, node.id]));
    // Newest run per task: `findWithHandoffByTaskIds` orders by seq desc, so the
    // first row seen for a task is its latest.
    const topics = await this.taskTopicModel.findWithHandoffByTaskIds(
      activeTasks.map((n) => n.taskId),
      activeTasks.length,
    );

    const delivered: Record<string, Date> = {};
    const seen = new Set<string>();
    for (const topic of topics) {
      const taskId = topic.sourceTaskId;
      if (!taskId || seen.has(taskId)) continue;
      seen.add(taskId);
      const nodeId = nodeByTaskId.get(taskId);
      // Only the newest run counts, and only while it is a delivery: an older
      // completed run under a newer running one is history, not a pending
      // verification.
      if (!nodeId || topic.status !== 'completed') continue;
      delivered[nodeId] = topic.completedAt ?? topic.createdAt;
    }

    return Object.keys(delivered).length > 0 ? delivered : undefined;
  };

  /**
   * Live heartbeat per active task node: the `agent_operations.updatedAt` of
   * the run behind it. The runtime refreshes that lease every ~90s while
   * `orchestration_workflow_nodes.updatedAt` only moves on observations / status changes, so a
   * client judging liveness from the node row alone would cry "lost" over any
   * long quiet stretch (a big tool call, the verify stage) the reclaim path
   * considers perfectly healthy.
   */
  private collectRunHeartbeats = async (
    graph: OrchestrationWorkflowGraphSnapshot,
  ): Promise<Record<string, Date> | undefined> => {
    const activeTasks = graph.nodes.filter(
      (node): node is OrchestrationWorkflowGraphNode & { taskId: string } =>
        node.kind === 'task' && node.status === 'active' && !!node.taskId,
    );
    if (activeTasks.length === 0) return undefined;

    const nodeByTaskId = new Map(activeTasks.map((node) => [node.taskId, node.id]));
    const running = await this.taskTopicModel.findRunningByTaskIds(
      activeTasks.map((n) => n.taskId),
    );

    // One batched read: the graph polls every few seconds per open client, so
    // a per-topic operation lookup would scale queries with task concurrency.
    const operationIds = [
      ...new Set(running.flatMap((topic) => (topic.operationId ? [topic.operationId] : []))),
    ];
    const operations = await new AgentOperationModel(
      this.db,
      this.userId,
      this.workspaceId,
    ).findByIds(operationIds);
    const operationById = new Map(operations.map((operation) => [operation.id, operation]));

    const heartbeats: Record<string, Date> = {};
    for (const topic of running) {
      const nodeId = topic.taskId ? nodeByTaskId.get(topic.taskId) : undefined;
      if (!nodeId || !topic.operationId || heartbeats[nodeId]) continue;
      const updatedAt = operationById.get(topic.operationId)?.updatedAt;
      if (updatedAt) heartbeats[nodeId] = updatedAt;
    }

    return Object.keys(heartbeats).length > 0 ? heartbeats : undefined;
  };

  /** Current lifecycle status, without paying for the whole graph. */
  status = async (
    orchestrationWorkflowId: string,
  ): Promise<OrchestrationWorkflowStatus | undefined> =>
    (await this.orchestrationWorkflowModel.findById(orchestrationWorkflowId))?.status;

  addNode = async (
    orchestrationWorkflowId: string,
    input: CreateOrchestrationWorkflowNodeInput,
  ) => {
    const node = await this.graphModel.createNode(orchestrationWorkflowId, input);
    if (!node)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchestration workflow not found' });
    return node;
  };

  addEdge = async (
    orchestrationWorkflowId: string,
    sourceNodeId: string,
    targetNodeId: string,
    kind: OrchestrationWorkflowEdgeKind,
  ) => {
    const edge = await this.graphModel.createEdge(
      orchestrationWorkflowId,
      sourceNodeId,
      targetNodeId,
      kind,
    );
    if (!edge)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchestration workflow not found' });
    return edge;
  };

  /**
   * Stop everything the orchestration workflow has running, then delete it and its graph.
   *
   * Deleting only the orchestration workflow row cascades the graph away but leaves each graph
   * Task — and the agent operation behind it — running, spending the user's
   * budget with nothing left on screen to stop it. The tasks themselves stay:
   * they are ordinary tasks with their own history and acceptance.
   */
  delete = async (orchestrationWorkflowId: string) => {
    let graph = await this.graphModel.getGraph(orchestrationWorkflowId);
    const managed = !!graph?.orchestrationWorkflow.config?.manager;
    const supervised =
      !!graph?.orchestrationWorkflow.config?.supervision?.enabled ||
      !!graph?.orchestrationWorkflow.config?.supervisorState;
    if (managed || supervised) {
      // Fence new claims before cancellation, then read the latest claimed turn.
      await this.db.transaction(async (db) => {
        const model = new OrchestrationWorkflowModel(db, this.userId, this.workspaceId);
        const current = await model.lockById(orchestrationWorkflowId);
        if (current && current.status !== 'paused') {
          await model.updateStatus(orchestrationWorkflowId, 'paused');
          await new OrchestrationWorkflowGraphModel(
            db,
            this.userId,
            this.workspaceId,
          ).recordOrchestrationWorkflowStatus(
            orchestrationWorkflowId,
            current.status,
            'paused',
            'Stopping Orchestration workflow before deletion',
          );
        }
      });
      graph = await this.graphModel.getGraph(orchestrationWorkflowId);
      if (graph) {
        if (managed)
          await new OrchestrationWorkflowManagerService(
            this.db,
            this.userId,
            this.workspaceId,
          ).stop(graph);
        if (supervised)
          await new OrchestrationWorkflowSupervisorService(
            this.db,
            this.userId,
            this.workspaceId,
          ).stop(graph);
      }
    }
    const taskIds = graph?.nodes.flatMap((node) => (node.taskId ? [node.taskId] : [])) ?? [];

    for (const taskId of taskIds) {
      const topics = await this.taskTopicModel.findByTaskId(taskId);
      for (const topic of topics) {
        if (topic.status !== 'running' || !topic.topicId) continue;
        // Deliberately not swallowed. Interrupting can fail — the runtime or a
        // device gateway may be unreachable — and going ahead would delete the
        // only surface that can stop an operation which keeps spending. Better
        // to leave the orchestration workflow intact and say so.
        try {
          await this.taskService.cancelTopic(topic.topicId);
        } catch (error) {
          throw new TRPCError({
            cause: error,
            code: 'PRECONDITION_FAILED',
            message:
              'Could not stop the work still running for this orchestration workflow, so it was not deleted. Try again once the run is reachable.',
          });
        }
      }
      await this.taskModel
        .updateStatusIfCurrent(taskId, 'running', 'paused')
        .catch((error) =>
          console.error('[OrchestrationWorkflowService.delete] failed to pause task:', error),
        );
    }

    if (managed || supervised) {
      return this.db.transaction(async (db) => {
        const model = new OrchestrationWorkflowModel(db, this.userId, this.workspaceId);
        const current = await model.lockById(orchestrationWorkflowId);
        if (
          current &&
          (current.status !== 'paused' ||
            current.config?.managerState?.token !==
              graph?.orchestrationWorkflow.config?.managerState?.token ||
            current.config?.managerState?.turns !==
              graph?.orchestrationWorkflow.config?.managerState?.turns ||
            current.config?.supervisorState?.revision !==
              graph?.orchestrationWorkflow.config?.supervisorState?.revision)
        ) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Orchestration workflow changed during cancellation; it was not deleted',
          });
        }
        return model.delete(orchestrationWorkflowId);
      });
    }
    return this.orchestrationWorkflowModel.delete(orchestrationWorkflowId);
  };

  /**
   * Move the orchestration workflow's lifecycle status and leave an event behind.
   *
   * The row update alone made status changes untraceable: `entityType='orchestration workflow'`
   * events existed in the schema but nothing wrote them, so a orchestration workflow's
   * planning → running → paused → achieved path could not be reconstructed
   * from its timeline. Transitions the coordinator makes are filed under the
   * coordinator actor; a person's pause/resume keeps the user attribution the
   * model defaults to — the split that separates what the coordinator decided
   * from what the user asked for relies on.
   *
   * A same-status write is a no-op — re-stamping `running` on every tick that
   * touches a running orchestration workflow would flood the timeline the way the unbounded
   * event read flooded the payload.
   */
  private transitionStatus = async (
    orchestrationWorkflow: OrchestrationWorkflowItem,
    to: OrchestrationWorkflowStatus,
    reason?: string,
    actor: 'coordinator' | 'user' = 'coordinator',
  ): Promise<OrchestrationWorkflowItem | undefined> => {
    if (orchestrationWorkflow.status === to) return orchestrationWorkflow;
    const updated = await this.orchestrationWorkflowModel.updateStatus(
      orchestrationWorkflow.id,
      to,
    );
    if (!updated) return undefined;
    const model = actor === 'coordinator' ? this.coordinatorGraph : this.graphModel;
    await model
      .recordOrchestrationWorkflowStatus(
        orchestrationWorkflow.id,
        orchestrationWorkflow.status,
        to,
        reason,
      )
      .catch((error) =>
        console.error(
          '[OrchestrationWorkflowService] failed to record orchestration workflow status:',
          error,
        ),
      );
    return updated;
  };

  pause = async (orchestrationWorkflowId: string) => {
    const graph = await this.requireGraph(orchestrationWorkflowId);
    // From here the pause is the person's, so no later measurement lifts it.
    // Written even when the orchestration workflow is already paused — that transition is a
    // no-op, so this marker is the only record that the person took it over.
    await this.setPauseReason(orchestrationWorkflowId, 'user');
    const orchestrationWorkflow = await this.transitionStatus(
      graph.orchestrationWorkflow,
      'paused',
      'paused by user',
      'user',
    );
    if (!orchestrationWorkflow)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchestration workflow not found' });
    return orchestrationWorkflow;
  };

  /**
   * What the orchestration workflow has spent against what it is allowed to spend.
   *
   * Rounds are counted across every Task in the graph, not per Task — the
   * budget is the orchestration workflow's, so `setBudget` has to read it exactly the way the
   * coordinator does or raising a budget would not reliably unstick a orchestration workflow.
   *
   * The calendar-time budget (schedule.deadline) is evaluated in the same
   * shape: time is the long-horizon budget unit the attempt/round/dollar trio
   * cannot express, and a orchestration workflow whose deadline passed must stop the same way a
   * orchestration workflow out of money does.
   */
  /**
   * Read every declared numeric clause against its series' latest observation.
   *
   * A missing series or a series with no points reads as `null` and fails its
   * clause: "never measured" is not "satisfied". The measured value is carried
   * out with the verdict so the trajectory records what the decision saw.
   */
  private evaluateMetricCriteria = async (
    graph: OrchestrationWorkflowGraphSnapshot,
  ): Promise<OrchestrationWorkflowMetricCriteriaState> => {
    const declared = graph.orchestrationWorkflow.config?.acceptance?.metrics ?? [];
    const metricModel = new MetricModel(this.db, this.userId, this.workspaceId);

    // Two queries for the whole contract, not two per clause: this runs on
    // every terminal tick, and a orchestration workflow carrying a large acceptance payload would
    // otherwise pace the connection pool for unrelated requests. Only the
    // declared keys are fetched — the same orchestration workflow can accumulate any number of
    // other sampled series, and none of them can gate acceptance.
    const series = await metricModel.findByKeys(
      'orchestrationWorkflow',
      graph.orchestrationWorkflow.id,
      declared.map((criterion) => criterion.key),
    );
    const seriesByKey = new Map(series.map((item) => [item.key, item]));
    const latestByMetricId = await metricModel.latestPointsByMetricIds(
      declared.flatMap((criterion) => {
        const id = seriesByKey.get(criterion.key)?.id;
        return id ? [id] : [];
      }),
    );

    const criteria = declared.map((criterion) => {
      const op = criterion.op ?? 'gte';
      const seriesId = seriesByKey.get(criterion.key)?.id;
      const point = seriesId ? latestByMetricId.get(seriesId) : undefined;
      const value = point?.value ?? null;
      return {
        key: criterion.key,
        met: value !== null && compareMetric(value, op, criterion.target),
        observedAt: point ? new Date(point.observedAt).getTime() : undefined,
        op,
        target: criterion.target,
        value,
      };
    });

    return { allMet: criteria.every((criterion) => criterion.met), criteria };
  };

  private evaluateBudget = async (
    orchestrationWorkflow: OrchestrationWorkflowItem,
    graph: OrchestrationWorkflowGraphSnapshot,
  ) => {
    const { runs, totalCost } = await this.resolveSpend(graph);
    const deadline = orchestrationWorkflow.config?.schedule?.deadline ?? null;
    return {
      costLimitReached:
        orchestrationWorkflow.maxTotalCost !== null &&
        totalCost >= Number(orchestrationWorkflow.maxTotalCost),
      deadline,
      deadlinePassed: deadline !== null && Date.now() >= new Date(deadline).getTime(),
      roundLimitReached:
        orchestrationWorkflow.maxRounds !== null && runs >= orchestrationWorkflow.maxRounds,
      runs,
      totalCost,
    };
  };

  /**
   * Rounds run and dollars spent, by the definition the budget is enforced
   * against: the runs of the graph's own Task nodes.
   *
   * `graph()` ships this to the client so the page's spend reads the same
   * number the coordinator will stop on. Note it is deliberately NOT the orchestration workflow
   * list's `totalRunCost`, which walks the whole `parent_task_id` subtree —
   * that number is larger for a orchestration workflow whose Tasks spawned Tasks.
   */
  private resolveSpend = async (graph: OrchestrationWorkflowGraphSnapshot) => {
    const [spend, supervision, management] = await Promise.all([
      this.taskTopicModel.sumRunCostByTaskIds(
        graph.nodes.flatMap((node) => (node.taskId ? [node.taskId] : [])),
      ),
      new OrchestrationWorkflowSupervisorService(this.db, this.userId, this.workspaceId).usage(
        graph.orchestrationWorkflow.config?.supervisorState,
      ),
      new OrchestrationWorkflowManagerService(this.db, this.userId, this.workspaceId).usage(
        graph.orchestrationWorkflow.config?.managerState,
      ),
    ]);
    return {
      ...spend,
      totalCost: spend.totalCost + supervision.totalCost + management.totalCost,
      totalTokens: spend.totalTokens + supervision.totalTokens + management.totalTokens,
    };
  };

  /**
   * Edit the orchestration workflow's standing acceptance requirement in place. The next
   * coordinator move and every later dispatched Task read the updated text;
   * an already-running Task keeps the contract it was dispatched with.
   */
  updateRequirement = async (orchestrationWorkflowId: string, requirement: string) => {
    const orchestrationWorkflow = await this.orchestrationWorkflowModel.update(
      orchestrationWorkflowId,
      { requirement },
    );
    if (!orchestrationWorkflow)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchestration workflow not found' });
    return orchestrationWorkflow;
  };

  /**
   * Hand the orchestration workflow to a different responsible agent. Every Task the
   * coordinator creates from here on is assigned to the new agent, and —
   * unless the caller opts out — the graph's unfinished Tasks move with it.
   * A Task mid-run keeps its current operation; the reassignment takes effect
   * on its next dispatched attempt, because `runTask` reads the assignee at
   * dispatch time.
   */
  setAgent = async (
    orchestrationWorkflowId: string,
    agentId: string,
    options?: { orchestrationWorkflowOnly?: boolean },
  ): Promise<{ orchestrationWorkflow: OrchestrationWorkflowItem; reassignedTaskIds: string[] }> => {
    if (
      agentId !==
      (await new AgentModel(this.db, this.userId, this.workspaceId).getOrchestratorSourceAgentId())
    ) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'ORCHESTRATOR_REQUIRED' });
    }
    await assertAgentUsableBy(this.db, agentId, {
      userId: this.userId,
      workspaceId: this.workspaceId,
    });
    await this.assertOrchestrationWorkflowAgentMountCapable(agentId);
    const orchestrationWorkflow = await this.orchestrationWorkflowModel.update(
      orchestrationWorkflowId,
      { agentId },
    );
    if (!orchestrationWorkflow)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchestration workflow not found' });

    const reassignedTaskIds: string[] = [];
    if (!options?.orchestrationWorkflowOnly) {
      // Snapshot the graph AFTER the orchestration workflow row moved: a task the coordinator
      // binds later inherits the new agent from the orchestration workflow, and a task bound
      // before is in this snapshot — so no concurrently created task can slip
      // through the handoff still pointing at the previous agent.
      const graph = await this.requireGraph(orchestrationWorkflowId);
      const taskIds = graph.nodes.flatMap((node) => (node.taskId ? [node.taskId] : []));
      const reassignable = (await this.taskModel.findByIds(taskIds)).filter(
        (task) =>
          task.workflowCategory !== 'done' &&
          task.workflowCategory !== 'canceled' &&
          task.assigneeAgentId !== agentId,
      );
      const derivedStatuses = await this.taskModel.derivedStatusByIds(
        reassignable.map((task) => task.id),
      );
      const isRunning = (task: { id: string }) => derivedStatuses[task.id] === 'running';
      const runningTaskIds = reassignable.filter(isRunning).map((task) => task.id);
      // Fence running incumbents BEFORE rewriting any assignee — the
      // ownership-transfer ordering (never commit "stored owner B / running
      // executor A"). The cancellation sweep then interrupts the remote
      // writer and parks each task for the coordinator to re-dispatch under
      // the new owner.
      if (runningTaskIds.length > 0) {
        await TaskDispatchModel.requestStopForTasks(
          this.db,
          runningTaskIds,
          'orchestration_workflow_agent_change',
        );
      }
      for (const task of reassignable) {
        await this.taskModel.update(
          task.id,
          { assigneeAgentId: agentId },
          isRunning(task) ? { executionTransfer: true } : {},
        );
        reassignedTaskIds.push(task.id);
      }
    }
    return { orchestrationWorkflow, reassignedTaskIds };
  };

  /**
   * Start every unfinished Task node over: interrupt the run it may still be
   * holding, clear the failure it may be parked on, and return the Task to
   * `backlog` so the next coordinator tick dispatches it afresh. Optionally
   * hands the orchestration workflow (and the restarted Tasks) to a different agent in the same
   * gesture. Resolved nodes and their completed Tasks are left untouched.
   */
  restart = async (
    orchestrationWorkflowId: string,
    options?: { agentId?: string },
  ): Promise<{ orchestrationWorkflow: OrchestrationWorkflowItem; restartedTaskIds: string[] }> => {
    if (options?.agentId) {
      if (
        options.agentId !==
        (await new AgentModel(
          this.db,
          this.userId,
          this.workspaceId,
        ).getOrchestratorSourceAgentId())
      ) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'ORCHESTRATOR_REQUIRED' });
      }
      await assertAgentUsableBy(this.db, options.agentId, {
        userId: this.userId,
        workspaceId: this.workspaceId,
      });
      await this.assertOrchestrationWorkflowAgentMountCapable(options.agentId);
    }
    const graph = await this.requireGraph(orchestrationWorkflowId);

    const unfinishedNodes = graph.nodes.filter(
      (node) => node.kind === 'task' && node.taskId && !TERMINAL_NODE_STATUSES.has(node.status),
    );
    const unfinishedNodeIds = new Set(unfinishedNodes.map((node) => node.id));
    const unfinishedTaskIds = unfinishedNodes.flatMap((node) => (node.taskId ? [node.taskId] : []));

    // A restarted task's pending failure gate is answered by the restart
    // itself. Left pending, it would keep winning the coordinator's
    // pending-decision branch and the orchestration workflow would sit `waiting_human` with
    // every task freshly reset. Gates on untouched nodes keep parking the
    // orchestration workflow — they ask something this restart does not answer.
    // Gate edges run task-node → decision-node (see openFailureDecision).
    const staleGates = graph.decisions.filter(
      (decision) =>
        decision.status === 'pending' &&
        graph.edges.some(
          (edge) =>
            edge.kind === 'leads_to' &&
            edge.targetNodeId === decision.nodeId &&
            unfinishedNodeIds.has(edge.sourceNodeId),
        ),
    );
    for (const gate of staleGates) {
      await this.graphModel.cancelDecision(
        orchestrationWorkflowId,
        gate.id,
        'Superseded by orchestration workflow restart',
      );
    }

    const restartedTaskIds: string[] = [];
    if (unfinishedTaskIds.length > 0) {
      const runningTopics = await this.taskTopicModel.findRunningByTaskIds(unfinishedTaskIds);
      for (const topic of runningTopics) {
        if (topic.topicId) await this.taskService.cancelTopic(topic.topicId);
      }
      // Re-read after the cancels and reset via compare-and-swap: a coordinator
      // tick dispatching concurrently moves the row between our read and the
      // write, the CAS loses, and that task is skipped instead of yanked out
      // from under a freshly claimed run (which would double-dispatch it).
      const derivedStatuses = await this.taskModel.derivedStatusByIds(unfinishedTaskIds);
      // Interrupt live executions first: `cancelTopic` stops the operation, and
      // the stop request retires the dispatch row so the task frees up once the
      // runtime acknowledges (the cancel sweep settles it; the parks route
      // through the same recovery path as any other interrupted attempt).
      const liveTaskIds = unfinishedTaskIds.filter(
        (taskId) => derivedStatuses[taskId] === 'running',
      );
      if (liveTaskIds.length > 0) {
        await TaskDispatchModel.requestStopForTasks(
          this.db,
          liveTaskIds,
          'orchestration_workflow_restart',
        );
      }
      for (const task of await this.taskModel.findByIds(unfinishedTaskIds)) {
        if (task.workflowCategory === 'done') continue;
        const reset = await this.taskModel.updateStatusIfCurrent(
          task.id,
          derivedStatuses[task.id] ?? task.status,
          'backlog',
          {
            error: null,
          },
        );
        if (!reset) continue;
        if (options?.agentId) {
          // The stop request above already fenced the incumbent run, so this
          // rebind is an ownership transfer, not a mid-flight reassignment.
          await this.taskModel.update(
            task.id,
            { assigneeAgentId: options.agentId },
            derivedStatuses[task.id] === 'running' ? { executionTransfer: true } : {},
          );
        }
        restartedTaskIds.push(task.id);
      }
    }

    // The handoff lands only after the interrupts succeeded — a cancelTopic
    // failure above must not leave the orchestration workflow pointing at the new agent while
    // its tasks and live runs still belong to the old one.
    let orchestrationWorkflow = graph.orchestrationWorkflow;
    if (options?.agentId) {
      const updated = await this.orchestrationWorkflowModel.update(orchestrationWorkflowId, {
        agentId: options.agentId,
      });
      if (!updated)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchestration workflow not found' });
      orchestrationWorkflow = updated;
    }

    // A restart is an explicit "start over": a orchestration workflow parked by a budget stop or
    // a manual pause must begin ticking again without a second gesture.
    if (orchestrationWorkflow.status === 'paused') {
      orchestrationWorkflow = (await this.resume(orchestrationWorkflowId)) ?? orchestrationWorkflow;
    }
    return { orchestrationWorkflow, restartedTaskIds };
  };

  setBudget = async (
    orchestrationWorkflowId: string,
    budget: {
      deadline?: string | null;
      maxConcurrentTasks?: number | null;
      maxExperiments?: number;
      maxRounds?: number | null;
      maxTotalCost?: number | null;
    },
  ) => {
    const before = await this.requireGraph(orchestrationWorkflowId);
    const wasBinding = await this.evaluateBudget(before.orchestrationWorkflow, before);

    // Deadline joins the two execution budgets on the orchestration workflow row's config; null
    // clears it, and omitting it leaves it alone — the cost/round editor sends
    // only what it owns, and must not silently drop a deadline someone set.
    // The merge keeps an untouched recovery/schedule block intact.
    const config = { ...before.orchestrationWorkflow.config };
    if (budget.maxExperiments !== undefined) {
      if (
        !config.exploration ||
        !Number.isInteger(budget.maxExperiments) ||
        budget.maxExperiments < 1 ||
        budget.maxExperiments > 200
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'An exploration Orchestration workflow requires 1–200 experiments',
        });
      }
      config.exploration = { ...config.exploration, maxExperiments: budget.maxExperiments };
    }
    if (budget.deadline !== undefined) {
      config.schedule = { ...config.schedule, deadline: budget.deadline };
    }
    if (budget.maxConcurrentTasks !== undefined) {
      config.maxConcurrentTasks = budget.maxConcurrentTasks;
    }

    const orchestrationWorkflow = await this.orchestrationWorkflowModel.update(
      orchestrationWorkflowId,
      {
        config,
        maxRounds: budget.maxRounds,
        maxTotalCost: budget.maxTotalCost,
      },
    );
    if (!orchestrationWorkflow)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchestration workflow not found' });

    // Raising a budget is how a user un-sticks a orchestration workflow the coordinator parked on
    // one, and `tick` refuses to move a paused orchestration workflow — so without this the
    // queued advance would return straight away and the user would have to find
    // Resume as a second gesture. Only a orchestration workflow the budget actually stopped is
    // reopened: if the old budget was not binding, this pause was somebody's
    // deliberate one and is left alone.
    const stoppedByBudget =
      wasBinding.costLimitReached || wasBinding.roundLimitReached || wasBinding.deadlinePassed;
    const stoppedByExploration =
      before.orchestrationWorkflow.config?.pausedBy === 'exploration_limit';
    if (
      orchestrationWorkflow.status !== 'paused' ||
      orchestrationWorkflow.config?.pausedBy === 'user' ||
      (!stoppedByBudget && !stoppedByExploration)
    )
      return orchestrationWorkflow;
    if (
      stoppedByExploration &&
      before.nodes.filter(
        (node) =>
          node.kind === 'task' && node.title !== ORCHESTRATION_WORKFLOW_ACCEPTANCE_TASK_TITLE,
      ).length >= (orchestrationWorkflow.config?.exploration?.maxExperiments ?? 0)
    )
      return orchestrationWorkflow;

    const nowBinding = await this.evaluateBudget(orchestrationWorkflow, before);
    if (nowBinding.costLimitReached || nowBinding.roundLimitReached || nowBinding.deadlinePassed) {
      return orchestrationWorkflow;
    }

    return (await this.resume(orchestrationWorkflowId)) ?? orchestrationWorkflow;
  };

  resume = async (orchestrationWorkflowId: string) => {
    const graph = await this.requireGraph(orchestrationWorkflowId);
    const status = graph.decisions.some((decision) => decision.status === 'pending')
      ? 'review'
      : 'running';
    await this.setPauseReason(orchestrationWorkflowId, undefined);
    const orchestrationWorkflow = await this.transitionStatus(
      graph.orchestrationWorkflow,
      status,
      'resumed by user',
      'user',
    );
    return orchestrationWorkflow ?? graph.orchestrationWorkflow;
  };

  decide = async (
    orchestrationWorkflowId: string,
    decisionId: string,
    optionId: string,
    resolution?: string,
  ) => {
    const graph = await this.requireGraph(orchestrationWorkflowId);
    const decision = graph.decisions.find((item) => item.id === decisionId);
    if (!decision || decision.status !== 'pending') {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Pending decision not found' });
    }
    if (decision.options?.length && !decision.options.some((option) => option.id === optionId)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown decision option' });
    }
    const resolved = await this.graphModel.resolveDecision(
      orchestrationWorkflowId,
      decisionId,
      optionId,
      resolution,
    );
    if (!resolved)
      throw new TRPCError({ code: 'CONFLICT', message: 'Decision was already resolved' });

    const incoming = graph.edges.find(
      (edge) => edge.targetNodeId === decision.nodeId && edge.kind === 'leads_to',
    );
    const source = incoming && graph.nodes.find((node) => node.id === incoming.sourceNodeId);
    if (source?.kind === 'task') {
      if (source.taskId)
        await new OrchestrationWorkflowSupervisorService(
          this.db,
          this.userId,
          this.workspaceId,
        ).recordProgress(graph, source.taskId, true);
      if (optionId === 'retry' && source.taskId) {
        await this.taskModel.updateStatus(source.taskId, 'backlog', { error: null });
        await this.graphModel.updateNodeStatus(
          orchestrationWorkflowId,
          source.id,
          'active',
          resolution,
        );
      } else if (
        optionId === 'retire' ||
        (optionId === 'fail' && source.title === ORCHESTRATION_WORKFLOW_ACCEPTANCE_TASK_TITLE)
      ) {
        await this.graphModel.updateNodeStatus(
          orchestrationWorkflowId,
          source.id,
          'retired',
          resolution,
        );
      }
    }
    const terminalAcceptanceFailed =
      source?.title === ORCHESTRATION_WORKFLOW_ACCEPTANCE_TASK_TITLE &&
      (optionId === 'retire' || optionId === 'fail');
    await this.transitionStatus(
      graph.orchestrationWorkflow,
      terminalAcceptanceFailed ? 'failed' : 'running',
      `decision "${decision.question}" resolved: ${optionId}`,
    );
    return resolved;
  };

  /**
   * Advance the orchestration workflow by one coordinator step.
   *
   * Choosing and doing are separate: `decideNextMove` is a pure function of the
   * graph, the responsible task and the budget, and everything under the switch
   * only carries that choice out. `onDecision` then receives both what the
   * coordinator read and what it did — the decision surface a orchestration workflow trajectory
   * records. It travels on that side channel rather than on `OrchestrationWorkflowTickResult`
   * because the result crosses tRPC to the client and the graph payload is
   * large, the same reason the context engine snapshot stays off the agent
   * runtime's event array.
   */
  tick = async (
    orchestrationWorkflowId: string,
    options?: OrchestrationWorkflowTickOptions,
  ): Promise<OrchestrationWorkflowTickResult> => {
    const at = Date.now();
    const graph = await this.requireGraph(orchestrationWorkflowId);
    if (!graph.orchestrationWorkflow.config?.planConfirmedAt) {
      return {
        orchestrationWorkflowId,
        message: 'The plan is awaiting human confirmation',
        outcome: 'waiting_human',
      };
    }
    if (graph.orchestrationWorkflow.config?.manager) {
      // The system's own planner leads whenever the OrchestrationWorkflow has one: a main Agent is
      // the fallback for problems that planner cannot express, not a replacement
      // for it. With exploration configured this call only settles a turn already
      // in flight; new turns start from `gateOrTakeOver` below, where the
      // coordinator has run out of moves. A OrchestrationWorkflow whose only planner is the main
      // Agent keeps being led by it.
      const result = await new OrchestrationWorkflowManagerService(
        this.db,
        this.userId,
        this.workspaceId,
      ).advance(graph, { mayStartTurn: !graph.orchestrationWorkflow.config.exploration });
      if (result) return result;
    }
    const frontier = selectFrontier(graph);

    // Every candidate's task, not just the head's: the scheduler has to know
    // which of them are in flight before it can decide what else to start.
    const candidateTaskIds = frontier.eligible.flatMap(({ node }) =>
      node.taskId ? [node.taskId] : [],
    );
    const tasksById = new Map(
      (candidateTaskIds.length > 0 ? await this.taskModel.findByIds(candidateTaskIds) : []).map(
        (task) => [task.id, task],
      ),
    );
    // Canonical execution truth per candidate — the retired `tasks.status`
    // label recomputed from workflow/execution rows, so a stale column value
    // cannot steer the coordinator.
    const statusById = new Map(
      Object.entries(await this.taskModel.derivedStatusByIds(candidateTaskIds)),
    );

    // Asked of every unblocked candidate, not just the head: the scheduler
    // walks past a running head to start an independent task, so a head that
    // needs no budget must not decide that nothing does. A orchestration workflow with nothing
    // startable still skips the query.
    const budget = frontierNeedsBudget(frontier, tasksById, statusById)
      ? toBudgetState(
          graph.orchestrationWorkflow,
          await this.evaluateBudget(graph.orchestrationWorkflow, graph),
        )
      : undefined;

    // Same shape as the budget: a database read the pure decision cannot do,
    // taken only in the terminal phase of a orchestration workflow that declares numeric clauses.
    const metricCriteria = needsMetricCriteria(graph)
      ? await this.evaluateMetricCriteria(graph)
      : undefined;

    const concurrency = resolveMaxConcurrentTasks(graph.orchestrationWorkflow);
    const move = decideNextMove({
      budget,
      concurrency,
      frontier,
      graph,
      metricCriteria,
      statusById,
      tasksById,
    });
    // The scheduler may pick past the head of the frontier, so every arm below
    // acts on the node the move chose, which is not necessarily the
    // highest-ranked candidate.
    const acting = move.chosenNodeId
      ? graph.nodes.find((node) => node.id === move.chosenNodeId)
      : undefined;
    const actingTask = acting?.taskId ? (tasksById.get(acting.taskId) ?? null) : undefined;

    const effects: OrchestrationWorkflowAdvanceEffect[] = [];

    const observe = (result: OrchestrationWorkflowTickResult): OrchestrationWorkflowTickResult => {
      options?.onDecision?.({
        at,
        branch: move.branch,
        budget,
        candidates: move.candidates,
        metricCriteria,
        chosenNodeId: move.chosenNodeId,
        effects,
        candidateTasks: frontier.eligible.flatMap(({ node }) => {
          const task = node.taskId ? tasksById.get(node.taskId) : undefined;
          return task ? [toFrontierTaskState(task, node.id, statusById.get(task.id))] : [];
        }),
        concurrency,
        graphState: toTraceGraphState(graph),
        message: result.message,
        outcome: result.outcome,
        taskId: result.taskId,
      });
      return result;
    };

    switch (move.branch) {
      case 'orchestration_workflow_paused':
      case 'orchestration_workflow_terminal': {
        return observe({ orchestrationWorkflowId, message: move.message, outcome: move.outcome });
      }

      case 'pending_decision': {
        await this.transitionStatus(
          graph.orchestrationWorkflow,
          'review',
          'a decision gate is open',
        );
        effects.push({ type: 'orchestration_workflow_status', detail: 'review' });
        return observe({
          orchestrationWorkflowId,
          message: move.message,
          nodeId: move.focusNodeId,
          outcome: move.outcome,
        });
      }

      // The measured half of acceptance stopped the orchestration workflow short of its delivery
      // contract. Nothing to create and nothing to settle — the next
      // observation is what moves it, which can be days away.
      //
      // Park it for the same reason `no_frontier` does: a `running` orchestration workflow that
      // always reports `no_progress` is picked by every sweep forever, and a
      // long-horizon orchestration workflow waiting on a measurement would sit in that state for
      // its whole life — enough of them crowd genuinely stranded orchestration workflows out of
      // the newest-first scan limit. `recordObservation` resumes it when a
      // measurement actually clears the gate.
      case 'measured_acceptance': {
        await this.setPauseReason(orchestrationWorkflowId, 'measured_acceptance');
        await this.transitionStatus(graph.orchestrationWorkflow, 'paused', move.message);
        effects.push({ type: 'orchestration_workflow_status', detail: 'paused' });
        return observe({ orchestrationWorkflowId, message: move.message, outcome: move.outcome });
      }

      case 'terminal_acceptance': {
        return observe(await this.settleTerminalAcceptance(graph, move, effects));
      }

      case 'explore_graph': {
        const spent = await this.evaluateBudget(graph.orchestrationWorkflow, graph);
        if (spent.costLimitReached || spent.roundLimitReached || spent.deadlinePassed) {
          await this.transitionStatus(
            graph.orchestrationWorkflow,
            'paused',
            'Budget exhausted before graph exploration',
          );
          effects.push({ type: 'orchestration_workflow_status', detail: 'paused: budget' });
          return observe({
            orchestrationWorkflowId,
            outcome: 'no_progress',
            message: 'Budget exhausted before graph exploration',
          });
        }
        return observe(
          await exploreGraph({
            db: this.db,
            userId: this.userId,
            workspaceId: this.workspaceId,
            graph,
            effects,
          }),
        );
      }

      case 'plan_decomposition': {
        return observe(await this.planDecomposition(graph, effects));
      }

      case 'no_frontier': {
        // Say so on the row instead of leaving a orchestration workflow that reads as `running`
        // while it cannot run — and, just as importantly, take it out of the
        // sweep's window. A `running` orchestration workflow that always reports `no_progress` is
        // picked by every scan forever, and enough of them starve every other
        // stalled orchestration workflow out of the newest-first limit.
        await this.transitionStatus(
          graph.orchestrationWorkflow,
          'paused',
          'no eligible task to advance',
        );
        effects.push({ type: 'orchestration_workflow_status', detail: 'paused' });
        return observe({ orchestrationWorkflowId, message: move.message, outcome: move.outcome });
      }

      case 'create_task': {
        return observe(await this.createResponsibleTask(graph, acting!, effects));
      }

      case 'missing_task': {
        await this.coordinatorGraph.updateNodeStatus(
          orchestrationWorkflowId,
          acting!.id,
          'waiting',
          'Responsible task is missing',
        );
        effects.push({ nodeId: acting!.id, type: 'node_status', detail: 'waiting' });
        return observe({
          orchestrationWorkflowId,
          message: move.message,
          nodeId: acting!.id,
          outcome: move.outcome,
        });
      }

      default: {
        // Everything from here on has a live responsible task.
        const task = actingTask!;
        await this.ensureTaskWorkVersion(graph.orchestrationWorkflow.id, acting!.id, task.id);

        switch (move.branch) {
          case 'consume_completed': {
            return observe(await this.consumeCompletedTask(graph, acting!.id, task.id, effects));
          }

          case 'recover_lease': {
            return observe(
              await this.resumeAbandonedTaskRecovery(graph, acting!.id, task, effects),
            );
          }

          case 'recover_verification': {
            return observe(await this.recoverAfterVerification(graph, acting!.id, task, effects));
          }

          case 'verification_blocked': {
            await this.setPauseReason(orchestrationWorkflowId, 'verification_unavailable');
            await this.transitionStatus(graph.orchestrationWorkflow, 'paused', move.message);
            return observe({
              orchestrationWorkflowId,
              message: move.message,
              nodeId: acting!.id,
              taskId: task.id,
              outcome: 'waiting_external',
            });
          }

          case 'failure_decision': {
            const supervision = await new OrchestrationWorkflowSupervisorService(
              this.db,
              this.userId,
              this.workspaceId,
            ).reviewFailure(graph, acting!.id, task);
            if (supervision) return observe(supervision);
            return observe(
              await this.gateOrTakeOver(graph, acting!.id, task.id, move.message, effects),
            );
          }

          case 'task_paused': {
            return observe({
              orchestrationWorkflowId,
              message: move.message,
              nodeId: acting!.id,
              outcome: move.outcome,
              taskId: task.id,
            });
          }

          case 'task_running': {
            const taskStatus = (await this.taskModel.derivedStatusByIds([task.id]))[task.id];
            if (taskStatus === 'running') {
              const recovered = await this.recoverAbandonedTask(graph, acting!.id, task, effects);
              if (recovered) return observe(recovered);
            }
            return observe({
              orchestrationWorkflowId,
              message: move.message,
              nodeId: acting!.id,
              outcome: move.outcome,
              taskId: task.id,
            });
          }

          case 'budget_exhausted': {
            await this.transitionStatus(graph.orchestrationWorkflow, 'paused', move.message);
            effects.push({ type: 'orchestration_workflow_status', detail: 'paused' });
            return observe({
              orchestrationWorkflowId,
              message: move.message,
              nodeId: acting!.id,
              outcome: move.outcome,
              taskId: task.id,
            });
          }

          default: {
            return observe(await this.dispatchWork(graph, acting!.id, task, effects));
          }
        }
      }
    }
  };

  /**
   * Create the OrchestrationWorkflow-level acceptance Task, or read the verdict it already
   * reached. Only runs once every other Task is terminal.
   */
  private settleTerminalAcceptance = async (
    graph: OrchestrationWorkflowGraphSnapshot,
    move: OrchestrationWorkflowMove,
    effects: OrchestrationWorkflowAdvanceEffect[],
  ): Promise<OrchestrationWorkflowTickResult> => {
    const orchestrationWorkflowId = graph.orchestrationWorkflow.id;

    if (move.outcome === 'achieved') {
      // The map must agree with the verdict: only task nodes get resolved as
      // Tasks complete, so without this the seeded problem nodes would read
      // "active / unanswered" forever on an achieved orchestration workflow.
      for (const node of graph.nodes) {
        if (node.kind !== 'problem' || TERMINAL_NODE_STATUSES.has(node.status)) continue;
        await this.coordinatorGraph.updateNodeStatus(
          orchestrationWorkflowId,
          node.id,
          'resolved',
          'Orchestration workflow achieved',
        );
        effects.push({ detail: 'resolved', nodeId: node.id, type: 'node_status' });
      }
      await this.transitionStatus(
        graph.orchestrationWorkflow,
        'achieved',
        'Orchestration workflow-level acceptance passed',
      );
      effects.push({ type: 'orchestration_workflow_status', detail: 'achieved' });
      return { orchestrationWorkflowId, message: move.message, outcome: 'achieved' };
    }

    if (move.outcome === 'no_progress') {
      return {
        orchestrationWorkflowId,
        message: move.message,
        nodeId: move.focusNodeId,
        outcome: 'no_progress',
      };
    }

    const result = await this.coordinatorGraph.createNodeOnce(orchestrationWorkflowId, {
      description: [
        `Complete and prove the overall Orchestration workflow acceptance requirement: ${graph.orchestrationWorkflow.requirement}`,
        'Inspect and reuse existing Orchestration workflow findings, artifacts, metrics, and command results as the primary evidence. Do not repeat expensive or destructive work when the existing evidence is sufficient and still auditable.',
        'Explicitly close every remaining acceptance gap instead of treating completed upstream Tasks as proof that the whole Orchestration workflow is achieved. Run only the missing or stale checks needed to close those gaps.',
        'Return one auditable final delivery with evidence for every requirement. If a requirement cannot be satisfied, state the exact gap and the minimum next action; do not claim the Orchestration workflow is complete.',
        graph.orchestrationWorkflow.config?.manager &&
        graph.orchestrationWorkflow.config.managerState?.submitted?.action === 'verify'
          ? `Main Agent verification handoff (context only, not acceptance criteria):\n${graph.orchestrationWorkflow.config.managerState.submitted.reason}\nIndependently check these notes against the evidence. They do not amend the authoritative Orchestration workflow requirement or establish that it passed.`
          : undefined,
      ]
        .filter(Boolean)
        .join('\n\n'),
      kind: 'task',
      priority: -1,
      title: ORCHESTRATION_WORKFLOW_ACCEPTANCE_TASK_TITLE,
    });
    if (!result) {
      return {
        orchestrationWorkflowId,
        message: 'Could not create the Orchestration workflow-level acceptance Task',
        outcome: 'no_progress',
      };
    }
    if (result.created) {
      effects.push({ nodeId: result.node.id, type: 'created_node', detail: 'terminal acceptance' });
      const problem = graph.nodes.find((node) => node.kind === 'problem');
      if (problem) {
        await this.coordinatorGraph.createEdge(
          orchestrationWorkflowId,
          problem.id,
          result.node.id,
          'decomposes',
        );
      }
    }
    return {
      orchestrationWorkflowId,
      message: result.created
        ? 'Created Orchestration workflow-level acceptance Task for the remaining contract'
        : 'Orchestration workflow-level acceptance Task was created by another coordinator',
      nodeId: result.node.id,
      outcome: 'advanced',
    };
  };

  /** Claim the chosen Task node and give it a responsible task plus its acceptance contract. */
  createResponsibleTask = async (
    graph: OrchestrationWorkflowGraphSnapshot,
    frontier: OrchestrationWorkflowGraphNode,
    effects: OrchestrationWorkflowAdvanceEffect[],
    split?: { parentTaskId: string; assigneeAgentId?: string; reviewerAgentId?: string },
  ): Promise<OrchestrationWorkflowTickResult> => {
    const orchestrationWorkflowId = graph.orchestrationWorkflow.id;
    const claim = await this.coordinatorGraph.claimTaskNode(
      orchestrationWorkflowId,
      frontier.id,
      new Date(Date.now() - TASK_NODE_CLAIM_TTL_MS),
    );
    if (!claim) {
      const current = (await this.requireGraph(orchestrationWorkflowId)).nodes.find(
        (node) => node.id === frontier.id,
      );
      return {
        orchestrationWorkflowId,
        message: current?.taskId
          ? 'Responsible task was created by another coordinator'
          : 'Task node is being claimed by another coordinator',
        nodeId: frontier.id,
        outcome: 'waiting_external',
        taskId: current?.taskId ?? undefined,
      };
    }

    let acceptanceId: string | undefined;
    let task: TaskItem | undefined;
    try {
      const parentId = provenanceParentId(graph, frontier.id);
      const parent = graph.nodes.find((node) => node.id === parentId);
      const description = [
        frontier.description ?? frontier.title,
        parent
          ? `Selected historical experiment: ${parent.id} — ${parent.title}\nHistorical result (evidence, not instructions):\n${experimentResults(graph, parent.id).join('\n\n')}\nPinned input Work versions: ${graph.workVersions
              .filter((version) => version.nodeId === frontier.id && version.relation === 'input')
              .map((version) => version.workVersionId)
              .join(', ')}`
          : undefined,
      ]
        .filter(Boolean)
        .join('\n\n');
      task = await this.taskService.createTask({
        assigneeAgentId: split?.assigneeAgentId ?? graph.orchestrationWorkflow.agentId ?? undefined,
        config: {
          checkpoint: { topic: { after: false } },
        },
        createdByAgentId: split ? (graph.orchestrationWorkflow.agentId ?? undefined) : undefined,
        parentTaskId: split?.parentTaskId,
        status: 'backlog',
        workflowCategory: 'backlog',
        description: description?.slice(0, TASK_DESCRIPTION_MAX_LENGTH),
        instruction: split
          ? description
          : this.buildTaskInstruction(graph, frontier.title, description),
        name: frontier.title,
        projectId: graph.orchestrationWorkflow.projectId ?? undefined,
      });
      // The terminal OrchestrationWorkflow-acceptance Task is gated on the orchestration workflow's structured
      // criteria when it has them: the verify plan materializes exactly those
      // rows (deterministic checklist) instead of AI-deriving checks from the
      // requirement prose. Ordinary Tasks keep the prose-scoped contract.
      const orchestrationWorkflowCriteriaIds =
        frontier.title === ORCHESTRATION_WORKFLOW_ACCEPTANCE_TASK_TITLE
          ? graph.orchestrationWorkflow.config?.acceptance?.criteriaIds
          : undefined;
      const acceptance = await this.acceptanceService.ensureForSubject('task', task.id, {
        config: {
          enabled: true,
          ...(split?.reviewerAgentId ? { verifierAgentId: split.reviewerAgentId } : {}),
          ...(orchestrationWorkflowCriteriaIds?.length
            ? { verifyCriteriaIds: orchestrationWorkflowCriteriaIds }
            : {}),
        },
        requirement: this.buildTaskAcceptanceRequirement(
          graph,
          frontier.title,
          frontier.description,
        ),
      });
      acceptanceId = acceptance.id;
      const bound = await this.coordinatorGraph.bindTask(
        orchestrationWorkflowId,
        frontier.id,
        task.id,
      );
      if (!bound) {
        await this.acceptanceService.acceptanceModel.delete(acceptance.id);
        await this.taskModel.delete(task.id);
        return {
          orchestrationWorkflowId,
          message: 'Responsible task was created by another coordinator',
          nodeId: frontier.id,
          outcome: 'waiting_external',
        };
      }
    } catch (error) {
      if (acceptanceId) {
        await this.acceptanceService.acceptanceModel.delete(acceptanceId).catch(() => {});
      }
      if (task) {
        await this.taskModel.delete(task.id).catch((cleanupError) => {
          console.error(
            '[OrchestrationWorkflowService.tick] failed to delete unbound task:',
            cleanupError,
          );
        });
      }
      await this.coordinatorGraph.updateNodeStatus(
        orchestrationWorkflowId,
        frontier.id,
        'proposed',
      );
      throw error;
    }

    effects.push({ nodeId: frontier.id, targetId: task.id, type: 'created_task' });
    const work = await this.workModel.registerTask({
      changeType: 'created',
      taskId: task.id,
      toolIdentifier: 'orchestration-workflow-coordinator',
      toolName: 'createResponsibleTask',
    });
    if (work?.currentVersionId) {
      await this.coordinatorGraph.attachWorkVersion(
        orchestrationWorkflowId,
        frontier.id,
        work.currentVersionId,
        'produced',
      );
    }
    if (!split) {
      await this.transitionStatus(
        graph.orchestrationWorkflow,
        'running',
        `dispatched ${task.identifier}`,
      );
    }
    return {
      orchestrationWorkflowId,
      message: `Created responsible task ${task.identifier}`,
      nodeId: frontier.id,
      outcome: 'advanced',
      taskId: task.id,
    };
  };

  /**
   * Automatic recovery after a Task delivery failed verification. Spends the
   * Task's remaining attempt budget before it escalates to a person.
   */
  private recoverAfterVerification = async (
    graph: OrchestrationWorkflowGraphSnapshot,
    nodeId: string,
    task: TaskItem,
    effects: OrchestrationWorkflowAdvanceEffect[],
  ): Promise<OrchestrationWorkflowTickResult> => {
    const orchestrationWorkflowId = graph.orchestrationWorkflow.id;
    const taskIds = graph.nodes.flatMap((node) => (node.taskId ? [node.taskId] : []));
    const runs = await this.taskTopicModel.findWithHandoffByTaskIds(taskIds, 10_000);
    const totalCost = runs.reduce((sum, run) => sum + Number(run.totalCost ?? 0), 0);
    const recovery = await new TaskRecoveryCoordinator(
      this.db,
      this.userId,
      this.workspaceId,
    ).recover({ orchestrationWorkflow: graph.orchestrationWorkflow, spentCost: totalCost, task });

    if (recovery.outcome === 'started' || recovery.outcome === 'already-running') {
      await this.coordinatorGraph.updateNodeStatus(
        orchestrationWorkflowId,
        nodeId,
        'active',
        'Automatically started the next Task attempt after verification feedback',
      );
      await this.transitionStatus(
        graph.orchestrationWorkflow,
        'running',
        'automatic recovery started a run',
      );
      // Only when this advance is the one that spawned the run. Reporting it
      // for a retry another advance owns would put a run in this trajectory
      // that it did not start, and attribute its cost here.
      if (recovery.outcome === 'started') {
        effects.push({
          detail: 'verification retry',
          nodeId,
          operationId: recovery.operationId,
          targetId: task.id,
          type: 'started_run',
        });
      }
      return {
        orchestrationWorkflowId,
        message: `Automatically retried task ${task.identifier}`,
        nodeId,
        outcome: 'waiting_external',
        taskId: task.id,
      };
    }

    // Nothing failed: somebody settled the Task while this advance was deciding.
    // Opening a gate would ask them to judge their own decision.
    if (recovery.outcome === 'settled') {
      return {
        orchestrationWorkflowId: graph.orchestrationWorkflow.id,
        message: `Task ${task.identifier} was settled while recovery was being decided`,
        nodeId,
        outcome: 'no_progress',
        taskId: task.id,
      };
    }
    const exhaustedReason =
      recovery.outcome === 'exhausted-cost'
        ? 'Orchestration workflow cost budget was exhausted'
        : recovery.outcome === 'exhausted-rounds'
          ? 'Task attempt budget was exhausted'
          : 'Automatic recovery could not start the next attempt';
    return this.gateOrTakeOver(graph, nodeId, task.id, exhaustedReason, effects);
  };

  /** Claim the task for dispatch and start its run. */
  private dispatchWork = async (
    graph: OrchestrationWorkflowGraphSnapshot,
    nodeId: string,
    task: TaskItem,
    effects: OrchestrationWorkflowAdvanceEffect[],
  ): Promise<OrchestrationWorkflowTickResult> => {
    const orchestrationWorkflowId = graph.orchestrationWorkflow.id;

    // CAID rollout gate: orchestrated fan-out only dispatches when the
    // deployment/workspace is admitted. The node stays untouched (ready) —
    // no claim, no error — so flipping the flag back on re-drives it.
    if (!(await isCaidDispatchAllowed({ userId: this.userId, workspaceId: this.workspaceId }))) {
      return {
        orchestrationWorkflowId,
        message: 'CAID dispatch admission is disabled for this deployment/workspace',
        reason: 'caid_dispatch_disabled',
        nodeId,
        outcome: 'waiting_external',
        taskId: task.id,
      };
    }

    // A task bound before the mount gate existed can still carry a
    // mount-incapable assignee. Minting its dispatch is a guaranteed
    // admission throw (the contract's builtin tools cannot mount), so park
    // the Task with the reason recorded and hand the stop to the same
    // manager-or-human gate every other unresolvable failure uses.
    if (
      task.assigneeAgentId &&
      (await taskRequiresBuiltinToolMount(this.db, task, {
        userId: this.userId,
        workspaceId: this.workspaceId,
      }))
    ) {
      const binding = await findUsableAgentExecutionBinding(this.db, task.assigneeAgentId, {
        userId: this.userId,
        workspaceId: this.workspaceId,
      });
      if (
        !binding ||
        !agentCanMountBuiltinToolSurface({ agencyConfig: binding.agencyConfig }, binding.model)
      ) {
        const reason = !binding
          ? 'The assigned agent is no longer usable — reassign the orchestration workflow or this task'
          : 'The assigned agent cannot mount the builtin tools this orchestration workflow task requires ' +
            '(its runtime cannot host the MCP tool surface) — reassign it to a capable agent';
        const parked = await this.taskModel.updateStatusIfCurrent(task.id, task.status, 'paused', {
          error: reason,
        });
        if (!parked) {
          return {
            orchestrationWorkflowId,
            message: `Task ${task.identifier} moved while its dispatch was being gated`,
            nodeId,
            outcome: 'waiting_external',
            taskId: task.id,
          };
        }
        return this.gateOrTakeOver(graph, nodeId, task.id, reason, effects);
      }
    }

    // Advances arrive from independent sources — an event hook, a manual nudge,
    // the sweep — and can overlap. `runTask` decides whether a run is already
    // in flight by reading the task's topics and only then creating one, so two
    // overlapping advances would both dispatch this Task and pay for it twice.
    // Claim the task first: the transition is a single conditional UPDATE, so
    // exactly one advance can win it. The durable claim is the dispatch row
    // itself — `hasActiveExecution` flips inside this transaction, so a racing
    // advance's fence fails instead of minting a second run.
    //
    // Counting free slots is a *separate* race the per-task claim cannot cover:
    // two advances reading the same `inFlight` below the cap would each claim a
    // different task and both succeed, taking the orchestration workflow past
    // `maxConcurrentTasks`. So the count and the claim happen together, under a
    // per-orchestration workflow advisory lock — the planner's cap check is a fast path, this is
    // the enforcement.
    const attemptKey = taskRunIdempotencyKey.orchestrationWorkflowTaskAttempt({
      executionGeneration: task.executionGeneration ?? 0,
      orchestrationWorkflowId: graph.orchestrationWorkflow.id,
      taskId: task.id,
      taskRevision: task.domainRevision ?? 0,
    });
    const claimed = await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${ORCHESTRATION_WORKFLOW_DISPATCH_LOCK_NAMESPACE}, hashtext(${orchestrationWorkflowId}))`,
      );

      const currentOrchestrationWorkflow = await new OrchestrationWorkflowModel(
        tx,
        this.userId,
        this.workspaceId,
      ).lockById(orchestrationWorkflowId);
      const currentGraph = await new OrchestrationWorkflowGraphModel(
        tx,
        this.userId,
        this.workspaceId,
      ).getGraph(orchestrationWorkflowId);
      if (
        !currentOrchestrationWorkflow ||
        !currentGraph ||
        currentOrchestrationWorkflow.status !== 'running' ||
        currentGraph.decisions.some((item) => item.status === 'pending')
      )
        return 'stopped' as const;

      // The frontier was ranked off a snapshot that is already stale: a plan
      // patch or a resolved decision can land between the tick's read and this
      // claim. Readiness is re-derived under the lock from the CURRENT graph —
      // a node that gained an unsatisfied depends_on edge, or was retired,
      // since the decision must not dispatch on the old receipt.
      const currentNode = currentGraph.nodes.find((node) => node.id === nodeId);
      if (!currentNode || TERMINAL_NODE_STATUSES.has(currentNode.status)) return 'stopped' as const;
      const resolvedNodeIds = new Set(
        currentGraph.nodes.filter((node) => node.status === 'resolved').map((node) => node.id),
      );
      const blockedBy = currentGraph.edges.filter(
        (edge) =>
          edge.kind === 'depends_on' &&
          edge.sourceNodeId === nodeId &&
          !resolvedNodeIds.has(edge.targetNodeId),
      );
      if (blockedBy.length > 0) return 'blocked' as const;

      const currentBudget = await new OrchestrationWorkflowService(
        tx,
        this.userId,
        this.workspaceId,
      ).evaluateBudget(currentOrchestrationWorkflow, currentGraph);
      if (
        currentBudget.costLimitReached ||
        currentBudget.roundLimitReached ||
        currentBudget.deadlinePassed
      )
        return 'stopped' as const;
      const inFlight = await new OrchestrationWorkflowGraphModel(
        tx,
        this.userId,
        this.workspaceId,
      ).countRunningTasks(orchestrationWorkflowId);
      if (inFlight >= resolveMaxConcurrentTasks(graph.orchestrationWorkflow))
        return 'at-capacity' as const;

      const fenced = await claimOrchestrationWorkflowTask(
        new TaskModel(tx, this.userId, this.workspaceId),
        // Fence on the derived status the decision read — `task.status` is
        // already that derived label on a model-fetched row.
        { id: task.id, status: task.status },
        'running',
        {
          error: null,
          startedAt: new Date(),
        },
      );
      if (!fenced) return false;
      const claim = await new TaskDispatchModel(tx, this.workspaceId).request({
        idempotencyKey: attemptKey,
        initiator: this.userId,
        origin: 'caid',
        requestedBy: ORCHESTRATION_WORKFLOW_COORDINATOR_ACTOR_ID,
        taskId: task.id,
        trigger: 'orchestrationWorkflow',
      });
      return claim.state === 'busy' ? false : { dispatchId: claim.dispatch.id };
    });

    if (claimed === 'stopped')
      return {
        orchestrationWorkflowId,
        message: 'Orchestration workflow is stopped or its execution budget is exhausted',
        outcome: 'no_progress',
        taskId: task.id,
      };

    if (claimed === 'blocked') {
      return {
        orchestrationWorkflowId,
        message: `Task ${task.identifier} was blocked by a newer plan revision before it could dispatch`,
        nodeId,
        outcome: 'waiting_external',
        taskId: task.id,
      };
    }
    if (claimed === 'at-capacity') {
      return {
        orchestrationWorkflowId,
        message: `Concurrency limit reached before ${task.identifier} could start`,
        nodeId,
        outcome: 'waiting_external',
        taskId: task.id,
      };
    }
    if (!claimed) {
      return {
        orchestrationWorkflowId,
        message: `Task ${task.identifier} is already being started`,
        nodeId,
        outcome: 'waiting_external',
        taskId: task.id,
      };
    }

    try {
      const run = await new TaskRunnerService(this.db, this.userId, this.workspaceId).runTask({
        extraPrompt:
          new OrchestrationWorkflowSupervisorService(
            this.db,
            this.userId,
            this.workspaceId,
          ).recoveryInstruction(graph, task.id) ??
          (graph.orchestrationWorkflow.config?.managerState?.submitted?.taskId === task.id
            ? graph.orchestrationWorkflow.config.managerState.submitted.reason
            : undefined),
        maxSteps: resolveTaskMaxSteps(graph.orchestrationWorkflow),
        idempotencyKey: attemptKey,
        taskId: task.id,
        trigger: 'orchestrationWorkflow',
      });
      await new OrchestrationWorkflowSupervisorService(
        this.db,
        this.userId,
        this.workspaceId,
      ).recordDispatch(graph, task.id, run.operationId);
      effects.push({
        nodeId,
        operationId: run.operationId,
        targetId: task.id,
        type: 'started_run',
      });
      return {
        orchestrationWorkflowId,
        message: `Started task ${task.identifier}`,
        nodeId,
        outcome: 'advanced',
        taskId: run.taskId,
      };
    } catch (error) {
      // We claimed the task, so nothing else will put it back. Release the
      // orphaned dispatch or the Task reads as running with no run behind it
      // and only the lease reclaims it. Abandoning parks it (`paused`), which
      // routes through the same recovery path as any other dead attempt.
      await this.releaseOrphanedDispatch(
        claimed.dispatchId,
        `orchestration workflow dispatch claim released: ${error}`,
      ).catch((releaseError) => {
        console.error(
          '[OrchestrationWorkflowService.tick] failed to release claimed task:',
          releaseError,
        );
      });
      throw error;
    }
  };

  /** Dispatch phases a task with no live operation can only be orphaned in. */
  private static readonly UNSTARTED_CLAIM_PHASES = [
    'requested',
    'claimed',
    'provisioning',
    'dispatched',
    'running',
  ] as const;

  /**
   * Settle a dispatch that never produced a run — the claim's terminal write.
   * `abandoned` leaves the active phase set, so the task's derived status falls
   * to `paused` and the recovery coordinator can pick it up.
   */
  private releaseOrphanedDispatch = async (dispatchId: string, reason: string) => {
    const settled = await this.db
      .update(taskDispatches)
      .set({
        lastCancelError: reason,
        leaseExpiresAt: null,
        leaseOwner: null,
        phase: 'abandoned',
        waitingReason: reason,
      })
      .where(
        and(
          eq(taskDispatches.id, dispatchId),
          inArray(taskDispatches.phase, ACTIVE_DISPATCH_PHASES),
        ),
      )
      .returning({ id: taskDispatches.id });
    return settled.length > 0;
  };

  private requireGraph = async (orchestrationWorkflowId: string) => {
    const graph = await this.graphModel.getGraph(orchestrationWorkflowId);
    if (!graph)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchestration workflow not found' });
    return graph;
  };

  private ensureTaskWorkVersion = async (
    orchestrationWorkflowId: string,
    nodeId: string,
    taskId: string,
  ) => {
    const graph = await this.coordinatorGraph.getGraph(orchestrationWorkflowId);
    if (graph?.workVersions.some((link) => link.nodeId === nodeId)) return;
    const work = await this.workModel.registerTask({
      changeType: 'created',
      taskId,
      toolIdentifier: 'orchestration-workflow-coordinator',
      toolName: 'createResponsibleTask',
    });
    if (work?.currentVersionId) {
      await this.coordinatorGraph.attachWorkVersion(
        orchestrationWorkflowId,
        nodeId,
        work.currentVersionId,
        'produced',
      );
    }
  };

  private recoverAbandonedTask = async (
    graph: OrchestrationWorkflowGraphSnapshot,
    nodeId: string,
    task: TaskItem,
    effects: OrchestrationWorkflowAdvanceEffect[] = [],
  ): Promise<OrchestrationWorkflowTickResult | undefined> => {
    const [runningTopic] = await this.taskTopicModel.findRunningByTaskIds([task.id]);
    const operationId = runningTopic?.operationId;
    const topicId = runningTopic?.topicId;
    const staleBefore = new Date(
      Date.now() - resolveOperationLeaseTimeout(graph.orchestrationWorkflow),
    );

    if (!operationId || !topicId) {
      // No running topic covers two very different shapes. A verify-bound Task
      // that delivered keeps its task `running` with a *completed* topic until
      // the verify run settles, and that judgment — a full agent run — outlives
      // the operation lease routinely. Re-dispatching there pays for a duplicate
      // attempt the verify settle path will cancel, and the canceled retry then
      // becomes the newest topic and shadows the delivered one. Hold off while
      // the delivery is fresh; past the grace window, fall through to the
      // release below so a verify run that died silently cannot strand the
      // orchestration workflow forever.
      const [lastTopic] = await this.taskTopicModel.findWithHandoff(task.id, 1);
      if (lastTopic?.status === 'completed') {
        const deliveredAt = lastTopic.completedAt ?? lastTopic.createdAt;
        if (new Date(deliveredAt).getTime() >= Date.now() - VERIFY_SETTLE_GRACE_MS) {
          return {
            orchestrationWorkflowId: graph.orchestrationWorkflow.id,
            message: `Task ${task.identifier} delivered; waiting for verification to settle`,
            nodeId,
            outcome: 'waiting_external',
            taskId: task.id,
          };
        }
      }

      // A task claimed for dispatch but with no run behind it. Normally this is
      // the sliver between the claim and `runTask` creating the topic; if the
      // worker died in there it is permanent, and every later advance would
      // report `waiting_external` forever because there is no operation to
      // reclaim. Once the claim is older than the lease, hand it back — the
      // orphaned dispatch abandons and the task parks (`paused`) for recovery.
      if (new Date(task.updatedAt) >= staleBefore) return undefined;
      const released = await this.db
        .update(taskDispatches)
        .set({
          lastCancelError: 'orchestration workflow dispatch claim lease expired without a run',
          leaseExpiresAt: null,
          leaseOwner: null,
          phase: 'abandoned',
          waitingReason: 'orchestration workflow dispatch claim lease expired without a run',
        })
        .where(
          and(
            eq(taskDispatches.taskId, task.id),
            inArray(taskDispatches.phase, OrchestrationWorkflowService.UNSTARTED_CLAIM_PHASES),
          ),
        )
        .returning({ id: taskDispatches.id });
      if (released.length === 0) return undefined;
      return {
        orchestrationWorkflowId: graph.orchestrationWorkflow.id,
        message: `Released the abandoned dispatch claim on task ${task.identifier}`,
        nodeId,
        outcome: 'advanced',
        taskId: task.id,
      };
    }

    const latestUsage = await createAgentStateManager().getOperationMetadata(operationId);
    const reclaimed = await this.db.transaction(async (tx) => {
      const settled = await new AgentOperationModel(
        tx,
        this.userId,
        this.workspaceId,
      ).settleStaleRunning(operationId, staleBefore, latestUsage?.totalCost);
      if (!settled) return false;

      await new TaskTopicModel(tx, this.userId, this.workspaceId).updateStatus(
        task.id,
        topicId,
        'timeout',
      );
      // The run's lease died without a verdict — settle it inside the reclaim
      // transaction so the operation/topic/task writes stay atomic.
      await settleTaskExecution(
        tx,
        this.userId,
        {
          context: { error: LEASE_EXPIRED_ERROR },
          outcome: 'outcome_unknown',
          taskId: task.id,
        },
        this.workspaceId,
      );
      return true;
    });
    if (!reclaimed) return undefined;

    return this.resumeAbandonedTaskRecovery(graph, nodeId, task, effects);
  };

  private resumeAbandonedTaskRecovery = async (
    graph: OrchestrationWorkflowGraphSnapshot,
    nodeId: string,
    task: TaskItem,
    effects: OrchestrationWorkflowAdvanceEffect[] = [],
  ): Promise<OrchestrationWorkflowTickResult> => {
    const recovery = await new TaskRecoveryCoordinator(
      this.db,
      this.userId,
      this.workspaceId,
    ).recover({ orchestrationWorkflow: graph.orchestrationWorkflow, task });
    if (recovery.outcome === 'started' || recovery.outcome === 'already-running') {
      await this.coordinatorGraph.updateNodeStatus(
        graph.orchestrationWorkflow.id,
        nodeId,
        'active',
        'Recovered an abandoned Task operation and started the next attempt',
      );
      await this.transitionStatus(
        graph.orchestrationWorkflow,
        'running',
        'reclaimed an abandoned Task',
      );
      if (recovery.outcome === 'started') {
        effects.push({
          detail: 'abandoned operation retry',
          nodeId,
          operationId: recovery.operationId,
          targetId: task.id,
          type: 'started_run',
        });
      }
      return {
        orchestrationWorkflowId: graph.orchestrationWorkflow.id,
        message: `Recovered abandoned task ${task.identifier}`,
        nodeId,
        outcome: 'waiting_external',
        taskId: task.id,
      };
    }

    // Nothing failed: somebody settled the Task while this advance was deciding.
    // Opening a gate would ask them to judge their own decision.
    if (recovery.outcome === 'settled') {
      return {
        orchestrationWorkflowId: graph.orchestrationWorkflow.id,
        message: `Task ${task.identifier} was settled while recovery was being decided`,
        nodeId,
        outcome: 'no_progress',
        taskId: task.id,
      };
    }
    const reason =
      recovery.outcome === 'exhausted-cost'
        ? 'Orchestration workflow cost budget was exhausted after an operation was abandoned'
        : recovery.outcome === 'exhausted-rounds'
          ? 'Task attempt budget was exhausted after an operation was abandoned'
          : 'Automatic recovery could not restart an abandoned operation';
    return this.gateOrTakeOver(graph, nodeId, task.id, reason, effects);
  };

  private buildTaskInstruction = (
    graph: OrchestrationWorkflowGraphSnapshot,
    title: string,
    description: string | null,
  ) =>
    [
      `Overall orchestration workflow context (background only): ${graph.orchestrationWorkflow.title}`,
      graph.orchestrationWorkflow.requirement
        ? `Overall orchestration workflow acceptance context (background only): ${graph.orchestrationWorkflow.requirement}`
        : undefined,
      `Current Task contract (authoritative execution scope): ${title}`,
      description,
      'Execute only the Current Task contract. Do not implement, validate, or pre-empt any sibling or downstream Task node, even when the overall orchestration workflow context describes it.',
      'The complete requirements for this Task are included here. Do not inspect unrelated agent documents to recover requirements. This Task carries its own Acceptance: run it inside this Task — drive the real product surface, capture the evidence, and submit it against your own criteria while you work. Submit evidence only; an independent verifier judges whether this Task is complete.',
      'For a Task that owns implementation, missing or broken capabilities within its scope are work to implement or repair, not a reason to stop at a capability report or ask the user for a finished implementation. Establish the runnable environment needed to exercise your changes, within the authorized scope. After failed verification, use the feedback to change the implementation or resolve the prerequisite before repeating the same checks; report a blocker only when progress requires unavailable external access, a user decision, or work outside this Task.',
      'For an investigation-only Task, deliver supported findings, gaps, and actionable next steps; do not silently expand into implementation. For a verification-only Task, report missing behavior honestly and identify the prerequisite or implementation work needed. Never claim a working product from a report or weaken the Current Task pass conditions to make it pass.',
      'Create implementation-level subtasks when useful. Finish the operation once the Current Task deliverable and its concrete evidence are ready; Acceptance verification will decide whether this Task is complete.',
      'Make the final delivery self-contained for an independent verifier that may not have workspace access. Include the relevant artifact contents or exact excerpts and the raw outputs of decisive verification commands; file paths and claims that checks passed are not sufficient evidence by themselves.',
      // A path on the machine that happened to run the task is not a
      // deliverable: the orchestration workflow page cannot open it, the reviewer cannot read it,
      // and /tmp does not survive the week. Only artifacts that reach the
      // product are harvested onto the OrchestrationWorkflow Graph (see attachTaskDeliverables).
      'Persist every deliverable inside the product, not only on the local disk. Write reports and analyses as agent documents, and produce generated files (pptx / xlsx / docx / pdf, …) in the operation workspace so they are uploaded and registered. A local path such as /tmp or a repository directory is a working location, not a delivery — anything left only there is unreviewable and is not attached to the Orchestration workflow.',
      'Return the produced artifacts, evidence, key findings, and the recommended next action. Do not mark the overall Orchestration workflow complete.',
    ]
      .filter(Boolean)
      .join('\n\n');

  /**
   * Turn a orchestration workflow with no tasks into an explorable structure: the LLM plans the
   * core question plus 1–5 independent directions, each carrying only its own
   * deliverable requirements. A planning failure degrades to one task seeded
   * from the raw requirement — the orchestration workflow must never stall on its planner.
   */
  private planDecomposition = async (
    graph: OrchestrationWorkflowGraphSnapshot,
    effects: OrchestrationWorkflowAdvanceEffect[],
  ) => {
    const orchestrationWorkflowId = graph.orchestrationWorkflow.id;
    const problem = graph.nodes.find((node) => node.kind === 'problem');
    const requirement =
      graph.orchestrationWorkflow.requirement ??
      problem?.description ??
      graph.orchestrationWorkflow.title;

    const claim = await this.orchestrationWorkflowModel.claimPlanning(orchestrationWorkflowId);
    if (!claim)
      return {
        orchestrationWorkflowId,
        message:
          'Another advance is already planning this orchestration workflow or tasks already exist',
        outcome: 'waiting_external' as const,
      };
    try {
      if (claim.previousStatus === 'planning') {
        await this.coordinatorGraph
          .recordOrchestrationWorkflowStatus(
            orchestrationWorkflowId,
            'planning',
            'running',
            'decomposition claimed',
          )
          .catch((error) =>
            console.error(
              '[OrchestrationWorkflowService] failed to record orchestration workflow status:',
              error,
            ),
          );
      }

      const generator = new OrchestrationWorkflowCriteriaGeneratorService(
        this.db,
        this.userId,
        this.workspaceId,
      );
      const plan = await generator
        .decompose({ agentId: graph.orchestrationWorkflow.agentId, requirement })
        .catch((error) => {
          // A missing authorized judgment binding must not be swallowed into
          // the single-task degrade — it means the orchestration workflow's coordinator agent is
          // gone or unbound, which is an explicit block, not a planner miss.
          if (isAcpJudgmentBindingError(error)) throw error;
          return undefined;
        });

      const draftTasks: OrchestrationWorkflowDecompositionDraft['tasks'] = plan?.tasks ?? [
        {
          instruction: problem?.description ?? requirement,
          title: graph.orchestrationWorkflow.title,
        },
      ];

      // Only the current lease owner may commit. The model call above does not
      // hold a database lock; all graph changes below share one short transaction.
      const committed = await this.db.transaction(async (tx) => {
        const orchestrationWorkflowModel = new OrchestrationWorkflowModel(
          tx,
          this.userId,
          this.workspaceId,
        );
        const current = await orchestrationWorkflowModel.findByIdForUpdate(orchestrationWorkflowId);
        const checkpoint = current?.config?.planningCheckpoint;
        if (
          !current ||
          current.status !== 'running' ||
          checkpoint?.token !== claim.token ||
          Date.parse(checkpoint.expiresAt) <= Date.now()
        )
          return undefined;
        const writer = new OrchestrationWorkflowGraphModel(tx, this.userId, this.workspaceId, {
          id: ORCHESTRATION_WORKFLOW_COORDINATOR_ACTOR_ID,
          type: 'system',
        });
        const fresh = await writer.getGraph(orchestrationWorkflowId);
        if (!fresh || fresh.nodes.some((node) => node.kind === 'task')) return undefined;
        const currentProblem = fresh.nodes.find((node) => node.kind === 'problem');
        if (
          fresh.orchestrationWorkflow.requirement !== graph.orchestrationWorkflow.requirement ||
          fresh.orchestrationWorkflow.title !== graph.orchestrationWorkflow.title ||
          currentProblem?.description !== problem?.description
        )
          return undefined;
        const committedEffects: OrchestrationWorkflowAdvanceEffect[] = [];

        if (plan && currentProblem) {
          // The node's description becomes the planner's own words for the core
          // question — not the acceptance boilerplate the orchestration workflow row keeps.
          await writer.updateNodeDescription(
            orchestrationWorkflowId,
            currentProblem.id,
            plan.problemStatement,
          );
        }

        const createdIds: string[] = [];
        for (const draft of draftTasks) {
          // An experiment is a container for a candidate answer, not the
          // default shell around every planned step. Only a direction the
          // planner marked with a hypothesis gets one; a certain delivery step
          // attaches straight to the problem, the same shape a manager-planned
          // Task takes.
          const hypothesis = draft.hypothesis?.trim();
          const experiment =
            currentProblem && hypothesis
              ? await writer.createNode(orchestrationWorkflowId, {
                  kind: 'experiment',
                  title: draft.title,
                  description: hypothesis,
                  questionId: currentProblem.id,
                })
              : undefined;
          if (currentProblem && hypothesis && !experiment)
            throw new Error('Failed to create a planned experiment');
          const node = await writer.createNode(orchestrationWorkflowId, {
            scopeId: experiment?.id,
            description: draft.instruction,
            kind: 'task',
            title: draft.title,
          });
          if (!node) throw new Error('Failed to create a planned task');
          if (!experiment && currentProblem)
            await writer.createEdge(
              orchestrationWorkflowId,
              currentProblem.id,
              node.id,
              'decomposes',
            );
          createdIds.push(node.id);
          committedEffects.push({ nodeId: node.id, type: 'created_node', detail: draft.title });
        }

        // The planner's `dependsOn` indices become `depends_on` edges, drawn
        // dependent → prerequisite the way `decideNextMove` reads a blocker. Only
        // earlier indices are honoured, so a hallucinated forward or self reference
        // can never form a cycle that deadlocks the frontier.
        for (const [index, draft] of draftTasks.entries()) {
          const nodeId = createdIds[index];
          if (!nodeId) continue;
          for (const dep of new Set(draft.dependsOn ?? [])) {
            const prerequisiteId = dep < index ? createdIds[dep] : undefined;
            if (!prerequisiteId) continue;
            await writer.createEdge(orchestrationWorkflowId, nodeId, prerequisiteId, 'depends_on');
          }
        }
        return committedEffects;
      });
      if (!committed) {
        return {
          orchestrationWorkflowId,
          message: 'Planning lease or input changed; re-read the graph',
          outcome: 'advanced' as const,
        };
      }
      effects.push(...committed);

      return {
        orchestrationWorkflowId,
        message: plan
          ? `Planned ${draftTasks.length} exploration direction${draftTasks.length > 1 ? 's' : ''}`
          : 'Planner unavailable; seeded a single task from the requirement',
        outcome: 'advanced' as const,
      };
    } finally {
      await this.orchestrationWorkflowModel.releasePlanning(orchestrationWorkflowId, claim.token);
    }
  };

  private buildTaskAcceptanceRequirement = (
    graph: OrchestrationWorkflowGraphSnapshot,
    title: string,
    description: string | null,
  ) => {
    if (title === ORCHESTRATION_WORKFLOW_ACCEPTANCE_TASK_TITLE) {
      return [
        `Terminal Orchestration workflow acceptance requirement (authoritative): ${graph.orchestrationWorkflow.requirement ?? graph.orchestrationWorkflow.title}`,
        description ? `Required delivery: ${description}` : undefined,
        'PASS only when concrete evidence proves that every clause of the terminal Orchestration workflow acceptance requirement is satisfied.',
        'An accurate gap analysis, a report that the Orchestration workflow is not accepted, a suggested next action, or partial progress is NOT a passing delivery. Reject it so automatic recovery can continue or open a Gate.',
        'If any required count, field, evidence quality, or other explicit threshold is missing, the verdict MUST be failed even when the builder correctly identified and documented the gap.',
      ]
        .filter(Boolean)
        .join('\n\n');
    }

    // The full orchestration workflow requirement (with its numbered acceptance list) is NOT
    // injected here: it belongs to the terminal acceptance task above, and
    // pasting it into every Task made each task's acceptance read as the whole
    // contract. A Task is judged on its own outcome only.
    return [
      `Verify only this Task: ${title}.`,
      description ? `Required Task outcome: ${description}` : undefined,
      `This Task is one direction of the Orchestration workflow "${graph.orchestrationWorkflow.title}"; the full Orchestration workflow contract is verified separately at the end.`,
      'Pass only when the current Task deliverable is complete and supported by concrete evidence. Ignore sibling and downstream Task deliverables; they are verified by their own acceptance runs.',
    ]
      .filter(Boolean)
      .join('\n\n');
  };

  /**
   * Link what a task actually delivered to the node that ordered it.
   *
   * The task Work attached alongside is the execution container; these are its
   * outputs — the documents and external resources the run registered. Without
   * them the graph records that a task finished but not what it produced, and
   * the deliverable survives only as a URL buried in the finding's prose.
   *
   * Harvested across every run of the task, not just the delivering one: a task
   * that wrote its document in an earlier round and only revised it in the last
   * still delivered that document. Works are deduplicated by identity and
   * linked at their newest version, so a document refined across rounds is one
   * deliverable with a history rather than several deliverables.
   *
   * `task` Works are deliberately excluded: the responsible task's own Work is
   * the execution container and the caller already links it. `file` Works are
   * opt-in at the registry (conversation lists do not want every exported
   * file), but a orchestration workflow's deliverables are exactly where a produced deck or PDF
   * belongs, so they are requested explicitly here.
   */
  private attachTaskDeliverables = async (
    orchestrationWorkflowId: string,
    nodeId: string,
    operationIds: string[],
    effects: OrchestrationWorkflowAdvanceEffect[],
  ) => {
    if (operationIds.length === 0) return;

    // The per-operation cap is applied to version EVENTS before this dedupes by
    // Work identity, so the default of 20 lets a document revised twenty times
    // push every other deliverable out of its own task's list.
    const byOperation = await this.workModel.listByRootOperations({
      includeFileWorks: true,
      limit: DELIVERABLE_EVENTS_PER_RUN,
      rootOperationIds: operationIds,
    });

    const newestByWork = new Map<string, WorkVersionEventItem>();
    for (const item of Object.values(byOperation).flat()) {
      if (item.type === 'task') continue;
      const seen = newestByWork.get(item.id);
      if (!seen || seen.version.createdAt < item.version.createdAt) newestByWork.set(item.id, item);
    }

    for (const item of newestByWork.values()) {
      const link = await this.coordinatorGraph.attachWorkVersion(
        orchestrationWorkflowId,
        nodeId,
        item.version.id,
        'produced',
      );
      // `attachWorkVersion` is idempotent, so a re-settled task re-links the
      // same versions silently; only a genuinely new link is worth an effect.
      if (link)
        effects.push({
          detail: item.type,
          nodeId,
          targetId: item.id,
          type: 'attached_work_version',
        });
    }
  };

  private consumeCompletedTask = async (
    graph: OrchestrationWorkflowGraphSnapshot,
    nodeId: string,
    taskId: string,
    effects: OrchestrationWorkflowAdvanceEffect[] = [],
  ): Promise<OrchestrationWorkflowTickResult> => {
    const existingFinding = graph.edges.some(
      (edge) => edge.sourceNodeId === nodeId && edge.kind === 'produces',
    );
    // The newest row by seq can be a retry that was canceled when verification
    // accepted an earlier delivery — the settle path cancels the in-flight
    // attempt it superseded. The finding must be synthesized from the run that
    // actually delivered, so prefer the newest completed topic (with a handoff
    // when one exists) over whatever happens to be last.
    const recent = await this.taskTopicModel.findWithHandoff(taskId, 10);
    const latest =
      recent.find((topic) => topic.status === 'completed' && topic.handoff) ??
      recent.find((topic) => topic.status === 'completed') ??
      recent[0];
    const completedWork = await this.workModel.registerTask({
      changeType: 'updated',
      rootOperationId: latest?.operationId,
      taskId,
      toolIdentifier: 'orchestration-workflow-coordinator',
      toolName: 'synthesizeTaskOutcome',
      topicId: latest?.topicId,
    });
    effects.push({
      nodeId,
      operationId: latest?.operationId ?? undefined,
      targetId: taskId,
      type: 'node_status',
      detail: 'resolved',
    });
    if (completedWork?.currentVersionId) {
      await this.coordinatorGraph.attachWorkVersion(
        graph.orchestrationWorkflow.id,
        nodeId,
        completedWork.currentVersionId,
        'produced',
      );
    }
    // Every run of the task, not the ten `findWithHandoff` reads for the
    // finding: an attempt budget above ten would otherwise strand a deliverable
    // produced early and merely referenced later.
    const allRuns = await this.taskTopicModel.findByTaskId(taskId);
    await this.attachTaskDeliverables(
      graph.orchestrationWorkflow.id,
      nodeId,
      allRuns.flatMap((topic) => (topic.operationId ? [topic.operationId] : [])),
      effects,
    );
    if (!existingFinding) {
      const handoff = latest?.handoff as TaskTopicHandoff | null;
      const finding = await this.coordinatorGraph.createNode(graph.orchestrationWorkflow.id, {
        confidence: 1,
        description: handoff?.content ?? handoff?.summary ?? undefined,
        kind: 'finding',
        scopeId: experimentOwner(graph, nodeId),
        status: 'resolved',
        title:
          handoff?.title ??
          handoff?.summary ??
          `Completed: ${graph.nodes.find((node) => node.id === nodeId)?.title}`,
      });
      if (finding) {
        effects.push({ detail: 'finding', nodeId, targetId: finding.id, type: 'created_node' });
        await this.coordinatorGraph.createEdge(
          graph.orchestrationWorkflow.id,
          nodeId,
          finding.id,
          'produces',
        );
      }
    }
    await this.coordinatorGraph.updateNodeStatus(
      graph.orchestrationWorkflow.id,
      nodeId,
      'resolved',
      'Responsible task completed',
    );
    await new OrchestrationWorkflowSupervisorService(
      this.db,
      this.userId,
      this.workspaceId,
    ).recordProgress(
      graph,
      taskId,
      false,
      latest?.status === 'completed' ? (latest.operationId ?? undefined) : undefined,
    );
    return {
      orchestrationWorkflowId: graph.orchestrationWorkflow.id,
      message: 'Task outcome was synthesized into a finding',
      nodeId,
      outcome: 'advanced',
      taskId,
    };
  };

  /**
   * Every stop-on-a-person funnels through here, so this is the one place a main
   * Agent can be offered the problem before the OrchestrationWorkflow parks on its owner.
   *
   * The coordinator only reaches this point once its own policy is out of moves:
   * the failure matched no recovery branch, the attempt budget ran out, or the
   * reason is one it cannot classify. That is precisely the class of problem the
   * deterministic lane cannot express, so it is handed over rather than escalated.
   * A main Agent that cannot help answers `escalate`, and the gate opens anyway —
   * one turn later, with a diagnosis attached.
   */
  private gateOrTakeOver = async (
    graph: OrchestrationWorkflowGraphSnapshot,
    nodeId: string,
    taskId: string,
    reason: string,
    effects: OrchestrationWorkflowAdvanceEffect[] = [],
  ): Promise<OrchestrationWorkflowTickResult> => {
    const takeover = await new OrchestrationWorkflowManagerService(
      this.db,
      this.userId,
      this.workspaceId,
    ).takeOver(graph, { reason, taskId });
    if (takeover) return takeover;
    // When the main Agent already looked at THIS problem, the gate carries what it
    // said: the person answering should see the Agent's reasoning, not just the
    // coordinator's own reason for stopping.
    const answered = answeredProblem(graph.orchestrationWorkflow.config?.managerState);
    const diagnosis =
      answered?.key === problemKey({ reason, taskId }) ? answered.reason.slice(0, 600) : undefined;
    return this.openFailureDecision(
      graph,
      nodeId,
      taskId,
      diagnosis ? `${reason} — main Agent: ${diagnosis}` : reason,
      effects,
    );
  };

  private openFailureDecision = async (
    graph: OrchestrationWorkflowGraphSnapshot,
    nodeId: string,
    taskId: string,
    reason: string,
    effects: OrchestrationWorkflowAdvanceEffect[] = [],
  ): Promise<OrchestrationWorkflowTickResult> => {
    return this.db.transaction(async (tx) => {
      const currentOrchestrationWorkflow = await new OrchestrationWorkflowModel(
        tx,
        this.userId,
        this.workspaceId,
      ).lockById(graph.orchestrationWorkflow.id);
      const service = new OrchestrationWorkflowService(tx, this.userId, this.workspaceId);
      const current = await service.requireGraph(graph.orchestrationWorkflow.id);
      if (
        !currentOrchestrationWorkflow ||
        ['paused', 'canceled', 'failed', 'achieved'].includes(currentOrchestrationWorkflow.status)
      ) {
        return {
          orchestrationWorkflowId: graph.orchestrationWorkflow.id,
          message: 'Orchestration workflow was stopped while recovery was being evaluated',
          outcome: 'no_progress',
          taskId,
        };
      }
      const taskModel = new TaskModel(tx, this.userId, this.workspaceId);
      const task = await taskModel.findById(taskId);
      const taskStatus = task ? (await taskModel.derivedStatusByIds([taskId]))[taskId] : undefined;
      if (task && ['running', 'backlog', 'completed'].includes(taskStatus ?? '')) {
        return {
          orchestrationWorkflowId: graph.orchestrationWorkflow.id,
          message: 'Task state changed while recovery was being evaluated',
          outcome: 'waiting_external',
          taskId,
        };
      }
      return service.openFailureDecisionLocked(current, nodeId, taskId, reason, effects);
    });
  };

  private openFailureDecisionLocked = async (
    graph: OrchestrationWorkflowGraphSnapshot,
    nodeId: string,
    taskId: string,
    reason: string,
    effects: OrchestrationWorkflowAdvanceEffect[],
  ): Promise<OrchestrationWorkflowTickResult> => {
    const existingDecisionNode = graph.edges
      .filter((edge) => edge.sourceNodeId === nodeId && edge.kind === 'leads_to')
      .map((edge) => graph.nodes.find((node) => node.id === edge.targetNodeId))
      .find((node) => node?.kind === 'decision' && node.status !== 'resolved');
    if (!existingDecisionNode) {
      const node = await this.coordinatorGraph.createNode(graph.orchestrationWorkflow.id, {
        description: reason,
        kind: 'decision',
        status: 'waiting',
        title: 'Choose how to recover failed task',
        scopeId: experimentOwner(graph, nodeId),
      });
      if (node) {
        effects.push({ detail: reason, nodeId, targetId: node.id, type: 'opened_decision' });
        await this.coordinatorGraph.createEdge(
          graph.orchestrationWorkflow.id,
          nodeId,
          node.id,
          'leads_to',
        );
        const terminalAcceptance =
          graph.nodes.find((candidate) => candidate.id === nodeId)?.title ===
          ORCHESTRATION_WORKFLOW_ACCEPTANCE_TASK_TITLE;
        await this.coordinatorGraph.createDecision(graph.orchestrationWorkflow.id, node.id, {
          authority: 'user',
          options: terminalAcceptance
            ? [
                { id: 'retry', label: 'Retry orchestration workflow acceptance' },
                { id: 'fail', label: 'Fail orchestration workflow' },
              ]
            : [
                { id: 'retry', label: 'Retry task' },
                { id: 'retire', label: 'Retire task' },
              ],
          question: terminalAcceptance
            ? `${reason}. Retry Orchestration workflow acceptance or fail this Orchestration workflow?`
            : `${reason}. Retry or retire this task node?`,
          recommendedOptionId: 'retry',
          requestedUserId: this.userId,
        });
      }
    }
    await this.coordinatorGraph.updateNodeStatus(
      graph.orchestrationWorkflow.id,
      nodeId,
      'waiting',
      reason,
    );
    await this.transitionStatus(graph.orchestrationWorkflow, 'review', reason);
    return {
      orchestrationWorkflowId: graph.orchestrationWorkflow.id,
      message: 'Task failed; a human decision gate was opened',
      nodeId,
      outcome: 'waiting_human',
      taskId,
    };
  };
}
