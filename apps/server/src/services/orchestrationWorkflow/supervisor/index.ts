import { OrchestrationWorkflowSupervisorIdentifier } from '@orvilo/builtin-tool-orchestration-workflow/supervisor';
import {
  buildOrchestrationWorkflowSupervisorPrompt,
  ORCHESTRATION_WORKFLOW_SUPERVISOR_INSTRUCTIONS,
} from '@orvilo/prompts';
import type {
  OrchestrationWorkflowGraphSnapshot,
  OrchestrationWorkflowSupervisionIncident,
  OrchestrationWorkflowSupervisionState,
  OrchestrationWorkflowTickResult,
  TaskItem,
  UserSystemAgentConfig,
} from '@orvilo/types';
import { TRPCError } from '@trpc/server';

import { AgentModel } from '@/database/models/agent';
import { AgentOperationModel } from '@/database/models/agentOperation';
import { OrchestrationWorkflowModel } from '@/database/models/orchestrationWorkflow';
import { OrchestrationWorkflowGraphModel } from '@/database/models/orchestrationWorkflowGraph';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { TopicModel } from '@/database/models/topic';
import { UserModel } from '@/database/models/user';
import type { OrviloDatabase } from '@/database/type';
import { findUsableAgentExecutionBinding } from '@/database/utils/agent-access';
import { AiAgentService } from '@/server/services/aiAgent';
import { agentCanMountBuiltinToolSurface } from '@/server/services/aiAgent/pipeline/resolveExecutionBinding';

import { scheduleOrchestrationWorkflowAdvance } from '../scheduler';
import { claimOrchestrationWorkflowTask } from '../taskClaim';
import {
  RECOVERABLE_TASK_STATUSES,
  recoveryEligibility,
  statusAuthoredByActor,
  supervisionLimit,
  SUPERVISOR_DIAGNOSIS_TIMEOUT_MS,
} from './policy';

/** Durable supervisor with a dedicated, incident-scoped tool set. */
export class OrchestrationWorkflowSupervisorService {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  stop = async (graph: OrchestrationWorkflowGraphSnapshot) => {
    const state = graph.orchestrationWorkflow.config?.supervisorState;
    if (!state) return;
    const operations = new AgentOperationModel(this.db, this.userId, this.workspaceId);
    for (const incident of state.incidents) {
      const operation = incident.supervisorOperationId
        ? await operations.findById(incident.supervisorOperationId)
        : await operations.findByTopicSourceMessage(
            state.topicId,
            `msg_orchestration_workflow_supervisor_${incident.id}`,
          );
      if (!operation) {
        if (incident.status !== 'diagnosing') continue;
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Supervisor dispatch is unconfirmed; Orchestration workflow was not deleted',
        });
      }
      if (['done', 'error', 'interrupted'].includes(operation.status)) continue;
      const result = await new AiAgentService(this.db, this.userId, {
        workspaceId: this.workspaceId,
      }).interruptTask({ operationId: operation.id, topicId: state.topicId });
      if (!result.success || result.deviceCancellationConfirmed === false) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Supervisor exit was not confirmed; Orchestration workflow was not deleted',
        });
      }
    }
  };

  /** Runs are capped by maxIncidents, so the bounded query covers the whole diagnostic ledger. */
  usage = async (state?: OrchestrationWorkflowSupervisionState) => {
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

  private explicitModelSelection = async (db: OrviloDatabase) => {
    const settings = await new UserModel(db, this.userId).getUserSettings();
    const config = (settings?.systemAgent as Partial<UserSystemAgentConfig> | undefined)
      ?.orchestrationWorkflow;
    return { model: config?.model || undefined, provider: config?.provider || undefined };
  };

  private initialize = async (
    graph: OrchestrationWorkflowGraphSnapshot,
  ): Promise<OrchestrationWorkflowSupervisionState> => {
    return this.db.transaction(async (tx) => {
      const model = new OrchestrationWorkflowModel(tx, this.userId, this.workspaceId);
      const orchestrationWorkflow = await model.lockById(graph.orchestrationWorkflow.id);
      if (!orchestrationWorkflow) throw new Error('Orchestration workflow not found');
      if (orchestrationWorkflow.config?.supervisorState)
        return orchestrationWorkflow.config.supervisorState;
      const agentModel = new AgentModel(tx, this.userId, this.workspaceId);
      const runtime = await agentModel.getPrimeRuntimeForCreation({
        ...(await this.explicitModelSelection(tx)),
        visibility: 'private',
      });
      const agent = await agentModel.create({
        ...runtime,
        plugins: [],
        systemRole: ORCHESTRATION_WORKFLOW_SUPERVISOR_INSTRUCTIONS,
        title: `Orchestration workflow Supervisor: ${orchestrationWorkflow.title}`.slice(0, 255),
        virtual: true,
        visibility: 'private',
      });
      const topic = await new TopicModel(tx, this.userId, this.workspaceId).create({
        agentId: agent.id,
        title: `Supervision: ${orchestrationWorkflow.title}`,
      });
      const state = await model.updateSupervisorState(orchestrationWorkflow.id, 0, {
        agentId: agent.id,
        incidents: [],
        topicId: topic.id,
      });
      if (!state) throw new Error('Supervisor initialization lost its claim');
      return state;
    });
  };

  /** Null hands the incident to the existing human Gate path. */
  reviewFailure = async (
    graph: OrchestrationWorkflowGraphSnapshot,
    nodeId: string,
    task: TaskItem,
  ): Promise<OrchestrationWorkflowTickResult | null> => {
    if (!graph.orchestrationWorkflow.config?.supervision?.enabled) return null;
    const orchestrationWorkflowId = graph.orchestrationWorkflow.id;
    const waiting = async (message: string): Promise<OrchestrationWorkflowTickResult> => {
      await scheduleOrchestrationWorkflowAdvance({
        delay: 5,
        orchestrationWorkflowId,
        userId: this.userId,
        workspaceId: this.workspaceId,
      });
      return {
        orchestrationWorkflowId,
        message,
        nodeId,
        outcome: 'waiting_external',
        taskId: task.id,
      };
    };
    const operations = new AgentOperationModel(this.db, this.userId, this.workspaceId);
    const runs = await new TaskTopicModel(this.db, this.userId, this.workspaceId).findByTaskId(
      task.id,
    );
    const latest = runs[0];
    // A kickoff that threw before writing a run has no operation to key an incident on,
    // and settlement is anchored on that run's sequence. Supervising it needs incident
    // identity and settlement redesigned, so it still reaches a person for now.
    if (!latest?.operationId) return null;
    const failedOperation = await operations.findById(latest.operationId);
    const state =
      graph.orchestrationWorkflow.config.supervisorState ?? (await this.initialize(graph));
    let incident = state.incidents.find((item) => item.failedOperationId === latest.operationId);
    if (!incident) {
      if (state.incidents.some((item) => item.status === 'diagnosing'))
        return waiting('Another interruption is being diagnosed');
      if (state.incidents.length >= supervisionLimit(graph.orchestrationWorkflow)) {
        for (const previous of state.incidents.filter(
          (item) => item.taskId === task.id && item.status === 'retrying',
        )) {
          await this.updateIncident(orchestrationWorkflowId, previous.id, {
            status: 'unsuccessful',
            reason: 'Recovery failed again; supervision incident budget exhausted',
          });
        }
        return null;
      }
      const taskModel = new TaskModel(this.db, this.userId, this.workspaceId);
      const taskStatus = task.status;
      let eligibility = recoveryEligibility(
        graph,
        task,
        failedOperation,
        statusAuthoredByActor(await taskModel.getActivities(task.id, 1, ['status']), taskStatus),
      );
      if (eligibility.eligible && (await this.budgetBlocked(graph))) {
        eligibility = {
          eligible: false,
          reason: 'Orchestration workflow budget or authority prevents automatic recovery',
        };
      }
      incident = {
        createdAt: new Date().toISOString(),
        eligible: eligibility.eligible,
        failedOperationId: latest.operationId,
        id: latest.operationId,
        nodeId,
        reason: eligibility.reason,
        status: eligibility.eligible ? 'diagnosing' : 'escalated',
        taskId: task.id,
        taskStatus,
      };
      const claimed = await new OrchestrationWorkflowModel(
        this.db,
        this.userId,
        this.workspaceId,
      ).updateSupervisorState(orchestrationWorkflowId, state.revision, {
        ...state,
        incidents: [
          ...state.incidents.map((item) =>
            item.taskId === task.id && item.status === 'retrying'
              ? { ...item, resolvedAt: new Date().toISOString(), status: 'unsuccessful' as const }
              : item,
          ),
          incident,
        ],
      });
      if (!claimed) return waiting('Another supervisor advance claimed this incident');
      if (!incident.eligible) return null;
      // The durable incident precedes dispatch. If the process dies afterwards,
      // a sweep adopts the topic operation instead of starting another diagnosis.
      try {
        const freshGraph = await new OrchestrationWorkflowGraphModel(
          this.db,
          this.userId,
          this.workspaceId,
        ).getGraph(orchestrationWorkflowId);
        if (!freshGraph || (await this.budgetBlocked(freshGraph))) {
          await this.updateIncident(orchestrationWorkflowId, incident.id, {
            reason: 'Orchestration workflow budget exhausted',
            status: 'escalated',
          });
          return null;
        }
        const runtime = await new AgentModel(
          this.db,
          this.userId,
          this.workspaceId,
        ).inheritRuntimeForCreation(state.agentId, {
          ...(await this.explicitModelSelection(this.db)),
          visibility: 'private',
        });
        // Revalidate the admitted runtime and explicit user selection before diagnosis.
        const supervisorBinding = await findUsableAgentExecutionBinding(this.db, state.agentId, {
          userId: this.userId,
          workspaceId: this.workspaceId,
        });
        if (
          !agentCanMountBuiltinToolSurface(
            { agencyConfig: supervisorBinding?.agencyConfig },
            runtime.model ?? supervisorBinding?.model,
          )
        ) {
          await this.updateIncident(orchestrationWorkflowId, incident.id, {
            reason: 'Supervisor agent runtime cannot mount its diagnostic tool surface',
            status: 'escalated',
          });
          return null;
        }
        const result = await new AiAgentService(this.db, this.userId, {
          workspaceId: this.workspaceId,
        }).execAgent({
          agentId: state.agentId,
          appContext: { topicId: state.topicId },
          clientIds: { userMessageId: `msg_orchestration_workflow_supervisor_${incident.id}` },
          autoStart: true,
          disableSelfFeedbackIntentTool: true,
          exclusivePluginIds: [OrchestrationWorkflowSupervisorIdentifier],
          instructions: ORCHESTRATION_WORKFLOW_SUPERVISOR_INSTRUCTIONS,
          // Exclusive is the ceiling; required makes the supervisor tool a
          // hard mount contract (unmountable → incident escalates).
          requiredToolIds: [OrchestrationWorkflowSupervisorIdentifier],
          maxSteps: 16,
          model: runtime.model ?? undefined,
          prompt: buildOrchestrationWorkflowSupervisorPrompt({
            failedOperation: { error: failedOperation?.error, id: latest.operationId },
            orchestrationWorkflow: {
              requirement: graph.orchestrationWorkflow.requirement,
              title: graph.orchestrationWorkflow.title,
            },
            orchestrationWorkflowId,
            incidentId: incident.id,
            previousIncidents: claimed.incidents.slice(-5),
            task: {
              description: task.description,
              error: task.error,
              id: task.id,
              name: task.name,
            },
            recentHandoffs: runs
              .slice(0, 3)
              .map((run) => ({ handoff: run.handoff, topicId: run.topicId })),
            workVersions: graph.workVersions.filter((work) => work.nodeId === nodeId),
          }),
          provider: runtime.provider ?? undefined,
          userInterventionConfig: { approvalMode: 'headless' },
        });
        await this.updateIncident(orchestrationWorkflowId, incident.id, {
          supervisorOperationId: result.operationId,
        });
      } catch (error) {
        console.error('[orchestration workflow:supervisor] diagnostic dispatch failed', error);
        // A lost response may already have created the operation. Let the next
        // sweep adopt it before deciding that the diagnosis failed.
      }
      return waiting('Supervisor is diagnosing the interruption');
    }
    if (incident.status !== 'diagnosing') return null;

    const supervisorOperationId =
      incident.supervisorOperationId ??
      (
        await operations.findByTopicSourceMessage(
          state.topicId,
          `msg_orchestration_workflow_supervisor_${incident.id}`,
        )
      )?.id;
    if (supervisorOperationId && !incident.supervisorOperationId) {
      await this.updateIncident(orchestrationWorkflowId, incident.id, { supervisorOperationId });
    }
    const operation = supervisorOperationId
      ? await operations.findById(supervisorOperationId)
      : undefined;
    const expired =
      Date.now() - new Date(incident.createdAt).getTime() > SUPERVISOR_DIAGNOSIS_TIMEOUT_MS;
    if (!operation || ['idle', 'running'].includes(operation.status)) {
      if (!expired) return waiting('Waiting for supervisor diagnosis');
      await this.updateIncident(orchestrationWorkflowId, incident.id, {
        reason: 'Supervisor diagnosis timed out; no recovery was applied',
        status: 'escalated',
      });
      return null;
    }
    if (operation.status !== 'done') {
      await this.updateIncident(orchestrationWorkflowId, incident.id, {
        reason: 'Supervisor could not complete the diagnosis',
        status: 'escalated',
      });
      return null;
    }
    // Only a scoped tool action is authority; prose/JSON in a final answer is not.
    const fresh = await new OrchestrationWorkflowModel(
      this.db,
      this.userId,
      this.workspaceId,
    ).findById(orchestrationWorkflowId);
    const diagnosis = fresh?.config?.supervisorState?.incidents.find(
      (item) => item.id === incident.id,
    )?.resolution;
    if (!diagnosis) {
      await this.updateIncident(orchestrationWorkflowId, incident.id, {
        reason: 'Supervisor did not submit a recovery action through its tools',
        status: 'escalated',
      });
      return null;
    }
    if (diagnosis.action === 'escalate') {
      await this.updateIncident(orchestrationWorkflowId, incident.id, {
        reason: diagnosis.reason,
        recoveryInstruction: diagnosis.instruction,
        status: 'escalated',
      });
      return null;
    }

    // Revalidate current authority, failure identity and budgets. A diagnosis
    // may finish after a user pause, manual retry, cancellation or new Gate.
    const applied = await this.db.transaction(async (tx) => {
      const model = new OrchestrationWorkflowModel(tx, this.userId, this.workspaceId);
      const orchestrationWorkflow = await model.lockById(orchestrationWorkflowId);
      if (!orchestrationWorkflow?.config?.supervisorState) return false;
      const currentGraph = await new OrchestrationWorkflowGraphModel(
        tx,
        this.userId,
        this.workspaceId,
      ).getGraph(orchestrationWorkflowId);
      const currentTask = await new TaskModel(tx, this.userId, this.workspaceId).findById(task.id);
      const currentRuns = await new TaskTopicModel(tx, this.userId, this.workspaceId).findByTaskId(
        task.id,
      );
      const current = orchestrationWorkflow.config.supervisorState;
      const ownIncident = current.incidents.find((item) => item.id === incident.id);
      if (
        !currentGraph ||
        !currentTask ||
        ownIncident?.status !== 'diagnosing' ||
        currentRuns[0]?.operationId !== incident.failedOperationId ||
        !recoveryEligibility(
          currentGraph,
          currentTask,
          failedOperation,
          statusAuthoredByActor(
            await new TaskModel(tx, this.userId, this.workspaceId).getActivities(task.id, 1, [
              'status',
            ]),
            currentTask.status,
          ),
        ).eligible ||
        (await new OrchestrationWorkflowSupervisorService(
          tx,
          this.userId,
          this.workspaceId,
        ).budgetBlocked(currentGraph))
      )
        return false;
      // A diagnosis takes minutes, so claim against the status the incident was
      // opened on. Re-reading first and comparing against that would swap whatever
      // the person chose in the meantime.
      if (!RECOVERABLE_TASK_STATUSES.has(currentTask.status)) return false;
      // An incident persisted before this field existed cannot say what it opened
      // on, so it cannot show the row is unchanged. Claiming against a later read
      // would restore the race this closes; a rolling deploy leaves at most the
      // handful mid-diagnosis, and they escalate rather than retry silently.
      if (!ownIncident.taskStatus) return false;
      const changed = await claimOrchestrationWorkflowTask(
        new TaskModel(tx, this.userId, this.workspaceId),
        // The status this incident opened on, so anything a person did across the
        // whole diagnosis wins the race rather than only a change since this tick.
        { id: task.id, status: ownIncident.taskStatus },
        'backlog',
        { error: null },
      );
      if (!changed) return false;
      await model.updateSupervisorState(orchestrationWorkflowId, current.revision, {
        ...current,
        incidents: current.incidents.map((item) =>
          item.id === incident.id
            ? {
                ...item,
                reason: diagnosis.reason,
                recoveryInstruction: diagnosis.instruction,
                status: 'retrying' as const,
              }
            : item,
        ),
      });
      return true;
    });
    if (!applied) {
      // A concurrent advance can have already applied the recommendation.
      const fresh = await new OrchestrationWorkflowModel(
        this.db,
        this.userId,
        this.workspaceId,
      ).findById(orchestrationWorkflowId);
      if (
        fresh?.config?.supervisorState?.incidents.find((item) => item.id === incident.id)
          ?.status === 'retrying'
      ) {
        return waiting('Supervisor recovery already queued');
      }
      await this.updateIncident(orchestrationWorkflowId, incident.id, {
        reason: 'Recovery preconditions changed; no recovery was applied',
        status: 'escalated',
      });
      return null;
    }
    return {
      orchestrationWorkflowId,
      message: 'Supervisor queued recovery within the original Task scope',
      nodeId,
      outcome: 'advanced',
      taskId: task.id,
    };
  };

  private budgetBlocked = async (graph: OrchestrationWorkflowGraphSnapshot) => {
    const { orchestrationWorkflow } = graph;
    const spend = await new TaskTopicModel(
      this.db,
      this.userId,
      this.workspaceId,
    ).sumRunCostByTaskIds(graph.nodes.flatMap((node) => (node.taskId ? [node.taskId] : [])));
    const usage = await this.usage(orchestrationWorkflow.config?.supervisorState);
    return (
      orchestrationWorkflow.status !== 'running' ||
      graph.decisions.some((decision) => decision.status === 'pending') ||
      (orchestrationWorkflow.maxRounds !== null && spend.runs >= orchestrationWorkflow.maxRounds) ||
      (orchestrationWorkflow.maxTotalCost !== null &&
        spend.totalCost + usage.totalCost >= Number(orchestrationWorkflow.maxTotalCost)) ||
      (!!orchestrationWorkflow.config?.schedule?.deadline &&
        Date.now() >= new Date(orchestrationWorkflow.config.schedule.deadline).getTime())
    );
  };

  updateIncident = async (
    orchestrationWorkflowId: string,
    id: string,
    patch: Partial<OrchestrationWorkflowSupervisionIncident>,
  ) => {
    await this.db.transaction(async (tx) => {
      const model = new OrchestrationWorkflowModel(tx, this.userId, this.workspaceId);
      const orchestrationWorkflow = await model.lockById(orchestrationWorkflowId);
      const state = orchestrationWorkflow?.config?.supervisorState;
      if (!state) return;
      await model.updateSupervisorState(orchestrationWorkflowId, state.revision, {
        ...state,
        incidents: state.incidents.map((item) =>
          item.id === id
            ? {
                ...item,
                ...patch,
                ...(['recovered', 'escalated', 'unsuccessful', 'human_resumed'].includes(
                  patch.status ?? '',
                )
                  ? { resolvedAt: new Date().toISOString() }
                  : {}),
              }
            : item,
        ),
      });
    });
  };

  recoveryInstruction = (graph: OrchestrationWorkflowGraphSnapshot, taskId: string) => {
    const incident = graph.orchestrationWorkflow.config?.supervisorState?.incidents.findLast(
      (item) => item.taskId === taskId && item.status === 'retrying',
    );
    return incident
      ? `Orchestration workflow Supervisor recovery of ${incident.failedOperationId}. Continue the SAME Task under its original acceptance criteria. First verify existing checkpoints, outputs and any externally committed effects. Reuse valid work; do not repeat completed training or blindly replay side effects. If an external commit cannot be checked, stop and report that uncertainty.\n${incident.recoveryInstruction}`
      : undefined;
  };

  recordDispatch = async (
    graph: OrchestrationWorkflowGraphSnapshot,
    taskId: string,
    operationId: string,
  ) => {
    const incident = graph.orchestrationWorkflow.config?.supervisorState?.incidents.findLast(
      (item) => item.taskId === taskId && item.status === 'retrying',
    );
    if (incident && !incident.recoveryOperationId) {
      await this.updateIncident(graph.orchestrationWorkflow.id, incident.id, {
        recoveryOperationId: operationId,
      });
    }
  };

  recordProgress = async (
    graph: OrchestrationWorkflowGraphSnapshot,
    taskId: string,
    human = false,
    acceptedOperationId?: string,
  ) => {
    for (const incident of graph.orchestrationWorkflow.config?.supervisorState?.incidents ?? []) {
      if (
        incident.taskId !== taskId ||
        !(human
          ? ['diagnosing', 'retrying'].includes(incident.status)
          : incident.status === 'retrying')
      )
        continue;
      if (!human) {
        if (!acceptedOperationId) continue;
        const runs = await new TaskTopicModel(this.db, this.userId, this.workspaceId).findByTaskId(
          taskId,
        );
        const failed = runs.find((run) => run.operationId === incident.failedOperationId);
        const delivered = runs.find(
          (run) => run.operationId === acceptedOperationId && run.status === 'completed',
        );
        // Only the delivery the coordinator actually consumed counts. A newer
        // cancelled attempt cannot take credit for an older accepted result.
        if (!failed || !delivered || delivered.seq <= failed.seq) continue;
        const recoveryRuns = runs.filter((run) => run.seq > failed.seq && run.seq <= delivered.seq);
        if (recoveryRuns.some((run) => run.trigger !== 'orchestrationWorkflow')) continue;
        // Also reconstructs attribution after dispatch succeeded but the process
        // died before recordDispatch. TaskRunner persists the orchestration workflow trigger.
        await this.updateIncident(graph.orchestrationWorkflow.id, incident.id, {
          recoveryOperationId: acceptedOperationId,
          status: 'recovered',
        });
      } else {
        await this.updateIncident(graph.orchestrationWorkflow.id, incident.id, {
          status: 'human_resumed',
        });
      }
    }
  };
}
