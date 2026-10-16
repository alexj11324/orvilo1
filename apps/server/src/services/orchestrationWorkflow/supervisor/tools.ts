import type {
  ResolveInterruptionParams,
  SupervisorScopeParams,
} from '@orvilo/builtin-tool-orchestration-workflow';
import { z } from 'zod';

import { AgentOperationModel } from '@/database/models/agentOperation';
import { DocumentModel } from '@/database/models/document';
import { OrchestrationWorkflowModel } from '@/database/models/orchestrationWorkflow';
import { OrchestrationWorkflowGraphModel } from '@/database/models/orchestrationWorkflowGraph';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { WorkModel } from '@/database/models/work';
import type { OrviloDatabase } from '@/database/type';
import type { ToolExecutionContext } from '@/server/services/toolExecution/types';

const scopeSchema = z.object({
  orchestrationWorkflowId: z.string().min(1),
  incidentId: z.string().min(1),
});
const resolutionSchema = scopeSchema
  .extend({
    action: z.enum(['retry', 'escalate']),
    instruction: z.string().trim().min(1).max(4000),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();

/** Every call is bound to the server-created topic, agent and incident operation. */
export class OrchestrationWorkflowSupervisorTools {
  constructor(
    private readonly context: Pick<
      ToolExecutionContext,
      'serverDB' | 'userId' | 'workspaceId' | 'topicId' | 'agentId' | 'operationId' | 'toolCallId'
    >,
  ) {}

  private run = async (
    params: SupervisorScopeParams,
    action: (
      scope: Awaited<ReturnType<OrchestrationWorkflowSupervisorTools['authorize']>>,
      db: OrviloDatabase,
    ) => Promise<unknown>,
  ) => {
    try {
      const data = await this.context.serverDB!.transaction(async (tx) => {
        const scope = await this.authorize(tx, scopeSchema.parse(params));
        return action(scope, tx);
      });
      return { content: JSON.stringify(data), success: true };
    } catch (error) {
      console.error('[orchestration workflow:supervisor:tool] call failed', error);
      return {
        content: error instanceof Error ? error.message : 'Supervisor tool failed',
        success: false,
      };
    }
  };

  private authorize = async (db: OrviloDatabase, params: SupervisorScopeParams) => {
    const { userId, workspaceId, topicId, agentId, operationId } = this.context;
    if (!userId || !topicId || !agentId || !operationId)
      throw new Error('Supervisor execution context required');
    const model = new OrchestrationWorkflowModel(db, userId, workspaceId);
    const orchestrationWorkflow = await model.lockById(params.orchestrationWorkflowId);
    const state = orchestrationWorkflow?.config?.supervisorState;
    const incident = state?.incidents.find((item) => item.id === params.incidentId);
    if (
      !orchestrationWorkflow?.config?.supervision?.enabled ||
      !state ||
      !incident ||
      state.topicId !== topicId ||
      state.agentId !== agentId
    ) {
      throw new Error(
        'This execution does not own the Orchestration workflow supervision incident',
      );
    }
    const operation = await new AgentOperationModel(
      db,
      userId,
      workspaceId,
    ).findByTopicSourceMessage(topicId, `msg_orchestration_workflow_supervisor_${incident.id}`);
    if (
      operation?.id !== operationId ||
      (incident.supervisorOperationId && incident.supervisorOperationId !== operationId)
    ) {
      throw new Error('Stale or unrelated supervisor operation');
    }
    const graph = await new OrchestrationWorkflowGraphModel(db, userId, workspaceId).getGraph(
      orchestrationWorkflow.id,
    );
    if (
      !graph ||
      orchestrationWorkflow.status !== 'running' ||
      graph.decisions.some((decision) => decision.status === 'pending') ||
      incident.status !== 'diagnosing'
    ) {
      throw new Error(
        'Orchestration workflow is stopped, awaiting a decision, or this incident is closed',
      );
    }
    return { graph, incident, model, state, userId, workspaceId };
  };

  inspectOrchestrationWorkflow = (params: SupervisorScopeParams) =>
    this.run(params, async ({ graph, model, state, incident }) => {
      await model.updateSupervisorState(graph.orchestrationWorkflow.id, state.revision, {
        ...state,
        incidents: state.incidents.map((item) =>
          item.id === incident.id
            ? { ...item, inspected: { ...item.inspected, orchestrationWorkflow: true } }
            : item,
        ),
      });
      return {
        orchestrationWorkflow: {
          id: graph.orchestrationWorkflow.id,
          title: graph.orchestrationWorkflow.title,
          requirement: graph.orchestrationWorkflow.requirement,
          status: graph.orchestrationWorkflow.status,
          maxRounds: graph.orchestrationWorkflow.maxRounds,
          maxTotalCost: graph.orchestrationWorkflow.maxTotalCost,
        },
        nodes: graph.nodes,
        edges: graph.edges,
        decisions: graph.decisions,
        workVersions: graph.workVersions,
      };
    });

  inspectTask = (params: SupervisorScopeParams) =>
    this.run(params, async ({ graph, incident, model, state, userId, workspaceId }, db) => {
      const task = await new TaskModel(db, userId, workspaceId).findById(incident.taskId);
      const runs = await new TaskTopicModel(db, userId, workspaceId).findWithHandoff(
        incident.taskId,
        3,
      );
      const failure = await new AgentOperationModel(db, userId, workspaceId).findById(
        incident.failedOperationId,
      );
      await model.updateSupervisorState(graph.orchestrationWorkflow.id, state.revision, {
        ...state,
        incidents: state.incidents.map((item) =>
          item.id === incident.id
            ? { ...item, inspected: { ...item.inspected, task: true } }
            : item,
        ),
      });
      return {
        task,
        attempts: runs,
        failure: { id: failure?.id, error: failure?.error, status: failure?.status },
        evidenceBoundary:
          'Handoffs report previous execution; local files and live processes have not been checked.',
      };
    });

  readArtifact = (params: SupervisorScopeParams & { workVersionId: string }) =>
    this.run(params, async ({ graph, incident, model, state, userId, workspaceId }, db) => {
      const link = graph.workVersions.find((item) => item.workVersionId === params.workVersionId);
      if (!link?.work)
        throw new Error(
          'Artifact is missing, inaccessible, or not linked to this Orchestration workflow',
        );
      const version = (
        await new WorkModel(db, userId, workspaceId).listVersions(link.work.workId)
      ).find((item) => item.id === params.workVersionId);
      if (!version) throw new Error('Work version is not accessible');
      const document =
        link.work.type === 'document' && link.work.resourceId
          ? await new DocumentModel(db, userId, workspaceId).findById(link.work.resourceId)
          : undefined;
      const content = document?.content ?? version.content;
      if (!content)
        throw new Error(
          'This reference has no readable text; file contents and checkpoints remain unverified',
        );
      const limit = 24000;
      await model.updateSupervisorState(graph.orchestrationWorkflow.id, state.revision, {
        ...state,
        incidents: state.incidents.map((item) =>
          item.id === incident.id
            ? {
                ...item,
                inspected: {
                  ...item.inspected,
                  artifactVersionIds: [
                    ...new Set([...(item.inspected?.artifactVersionIds ?? []), version.id]),
                  ],
                },
              }
            : item,
        ),
      });
      return {
        workVersionId: version.id,
        source: document ? 'current_document_not_version_snapshot' : 'work_version_snapshot',
        content: content.slice(0, limit),
        truncated: content.length > limit,
      };
    });

  resolveInterruption = (params: ResolveInterruptionParams) =>
    this.run(params, async ({ graph, incident, model, state }) => {
      const input = resolutionSchema.parse(params);
      if (!this.context.toolCallId) throw new Error('Durable tool-call identity required');
      if (!incident.inspected?.orchestrationWorkflow || !incident.inspected?.task)
        throw new Error(
          'Inspect the Orchestration workflow and Task before choosing a recovery action',
        );
      if (incident.resolution)
        return { recorded: true, resolution: incident.resolution, duplicate: true };
      const resolution = {
        action: input.action,
        instruction: input.instruction,
        reason: input.reason,
        toolCallId: this.context.toolCallId,
      };
      await model.updateSupervisorState(graph.orchestrationWorkflow.id, state.revision, {
        ...state,
        incidents: state.incidents.map((item) =>
          item.id === incident.id ? { ...item, resolution } : item,
        ),
      });
      return {
        recorded: true,
        action: input.action,
        message:
          'Finish this supervisor turn. The coordinator will recheck authority and budget before applying the request. Recovery is not yet success.',
      };
    });
}
