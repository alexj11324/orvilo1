import { TaskIdentifier } from '@orvilo/builtin-tool-task';
import type { TaskItem } from '@orvilo/types';

import { AgentModel } from '@/database/models/agent';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { TeamModel } from '@/database/models/team';
import type { OrviloDatabase } from '@/database/type';
import { assertCanUseWorkspaceAgent } from '@/server/routers/lambda/_helpers/workspaceAgentGuard';
import { agentCanMountBuiltinToolSurface } from '@/server/services/aiAgent/pipeline/resolveExecutionBinding';

import { resolveWorkflowTransition } from '../taskSettlement/workflowTransition';

export const WAITING_FOR_REVIEWER = 'Delivery is waiting for a reviewer Agent';

export const isWaitingForReviewer = (
  task: Pick<TaskItem, 'workflowCategory' | 'parkedReason' | 'error'>,
) =>
  task.workflowCategory === 'in_progress' &&
  task.parkedReason === 'review_required' &&
  task.error?.startsWith(WAITING_FOR_REVIEWER) === true;

/** Ask the workspace's chosen Orchestrator to assign a reviewer through the normal task tool. */
export const requestReviewerAssignment = async (
  db: OrviloDatabase,
  userId: string,
  task: TaskItem,
  workspaceId?: string,
) => {
  const model = new TaskModel(db, userId, workspaceId);
  const current = await model.findById(task.id);
  if (!current || current.reviewerAgentId || !isWaitingForReviewer(current)) return;
  try {
    const agentModel = new AgentModel(db, userId, workspaceId);
    const agentId = await agentModel.getOrchestratorSourceAgentId();
    await assertCanUseWorkspaceAgent({ agentId, db, userId, workspaceId });
    const agent = await agentModel.getAgentConfigForExecution(agentId);
    if (!agent || !agentCanMountBuiltinToolSurface(agent, agent.model)) {
      throw new Error('Orchestrator runtime cannot mount the task tool');
    }
    const { AiAgentService } = await import('../aiAgent');
    const result = await new AiAgentService(db, userId, { workspaceId }).execAgent({
      additionalPluginIds: [TaskIdentifier],
      agentId,
      appContext: { taskId: task.id },
      autoStart: true,
      skipTaskVerification: true,
      prompt: `Issue ${task.identifier} delivered and is waiting for a reviewer Agent. Call viewTask to read it and the usable reviewer Agents. For automatic assignment, choose an Agent with canReviewIssues=true when one is available, including yourself if appropriate, then call editTask with reviewerAgentId. Unsupported choices wait for a person. Do not rerun the delivered task.`,
      userInterventionConfig: { approvalMode: 'headless' },
    });
    if (!result.success) throw new Error(result.error ?? 'Orchestrator could not run');
    if (result.status === 'idle' && !result.autoStarted) {
      await model.updateWithLog(
        current.id,
        {
          error: `${WAITING_FOR_REVIEWER}: Orchestrator device offline; waiting for reconnect. You can assign a reviewer Agent manually.`,
        },
        {},
        { expectedDomainRevision: current.domainRevision },
      );
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // This explanation must not overwrite a concurrent manual assignment or acceptance.
    try {
      await model.updateWithLog(
        current.id,
        {
          error: `${WAITING_FOR_REVIEWER}: Orchestrator unavailable (${reason}). You can assign a reviewer Agent manually.`,
        },
        {},
        {
          expectedDomainRevision: current.domainRevision,
        },
      );
    } catch (writeError) {
      console.error('[task:reviewerAssignment] waiting explanation was not applied', writeError);
    }
  }
};

export const resumeReviewerAssignment = async (
  db: OrviloDatabase,
  userId: string,
  taskId: string,
  workspaceId?: string,
) => {
  const model = new TaskModel(db, userId, workspaceId);
  const task = await model.findById(taskId);
  if (!task?.reviewerAgentId || !isWaitingForReviewer(task)) return;
  try {
    const { resolveIssueReviewer } = await import('./review');
    await resolveIssueReviewer(db, userId, taskId, workspaceId);
  } catch (error) {
    await model.updateWithLog(
      task.id,
      {
        error: `${WAITING_FOR_REVIEWER}: ${error instanceof Error ? error.message : String(error)}`,
      },
      {},
      { expectedDomainRevision: task.domainRevision },
    );
    return;
  }
  const states =
    task.teamId && workspaceId
      ? await new TeamModel(db, userId, workspaceId).listWorkflowStates(task.teamId)
      : [];
  const { patch } = resolveWorkflowTransition({ category: 'in_review', states });
  const updated = await model.updateWithLog(
    task.id,
    { ...patch, error: null },
    {},
    {
      expectedDomainRevision: task.domainRevision,
    },
  );
  if (!updated) return;
  const { startIssueReview } = await import('./review');
  await startIssueReview(db, userId, taskId, {}, workspaceId);
};

export const markReviewerUnavailable = async (
  db: OrviloDatabase,
  userId: string,
  params: { taskId: string; reason: string; operationId?: string },
  workspaceId?: string,
) => {
  const model = new TaskModel(db, userId, workspaceId);
  const task = await model.findById(params.taskId);
  if (!task || ['done', 'canceled'].includes(task.workflowCategory)) return;
  if (params.operationId) {
    const topic = task.currentTopicId
      ? await new TaskTopicModel(db, userId, workspaceId).findByTopicId(task.currentTopicId)
      : null;
    if (topic?.operationId !== params.operationId) return;
  }
  try {
    await model.updateWithLog(
      task.id,
      {
        status: 'paused',
        workflowCategory: 'in_progress',
        workflowStateId: null,
        workflowStateRefId: null,
        parkedReason: 'review_required',
        error: `${WAITING_FOR_REVIEWER}: ${params.reason}`,
      },
      {},
      { expectedDomainRevision: task.domainRevision },
    );
  } catch (error) {
    console.error('[task:reviewerAssignment] reviewer wait lost its revision fence', error);
  }
};
