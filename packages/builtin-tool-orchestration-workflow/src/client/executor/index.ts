import { taskExecutor } from '@orvilo/builtin-tool-task/client/executor';
import type {
  BuiltinToolContext,
  BuiltinToolResult,
  OrchestrationWorkflowGraphSnapshot,
  ToolAfterCallContext,
} from '@orvilo/types';
import { BaseExecutor } from '@orvilo/types';

import { orchestrationWorkflowService } from '@/services/goal';

import { OrchestrationWorkflowIdentifier } from '../../manifest';
import {
  buildOrchestrationWorkflowRequirement,
  resolveOrchestrationWorkflowAttemptBudget,
  resolveOrchestrationWorkflowConcurrency,
  resolveOrchestrationWorkflowScheduleConfig,
} from '../../startOrchestrationWorkflowInput';
import type { CreateOrchestrationWorkflowParams } from '../../types';
import { OrchestrationWorkflowApiName } from '../../types';

/**
 * `/goal` creates a Goal Graph, not a task with a goal row attached: the graph
 * owns the decomposition, dispatches its own Work Tasks and their acceptance
 * contracts, and stops on a decision gate when a Work runs out of attempts.
 * The drafted criteria become the goal's acceptance requirement, which the
 * coordinator folds into every Work contract it writes.
 */
class GoalExecutor extends BaseExecutor<typeof OrchestrationWorkflowApiName> {
  readonly identifier = OrchestrationWorkflowIdentifier;
  protected readonly apiEnum = OrchestrationWorkflowApiName;

  onAfterCall = async (context: ToolAfterCallContext): Promise<void> => {
    await taskExecutor.onAfterCall(context);
  };

  startOrchestrationWorkflow = async (
    params: CreateOrchestrationWorkflowParams,
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    if (!ctx?.agentId) {
      return {
        content: 'A goal needs the current agent as its assignee.',
        error: { message: 'agentId is required', type: 'MissingAgent' },
        success: false,
      };
    }

    const criteria = (params.criteria ?? []).filter((item) => item.title?.trim());
    if (criteria.length === 0) {
      return {
        content: 'A goal needs at least one acceptance criterion.',
        error: { message: 'criteria array is empty', type: 'EmptyCriteria' },
        success: false,
      };
    }

    try {
      const scheduleConfig = resolveOrchestrationWorkflowScheduleConfig(params.deadline);
      const maxConcurrentTasks = resolveOrchestrationWorkflowConcurrency(params.maxConcurrentTasks);
      const graph = await orchestrationWorkflowService.create({
        agentId: ctx.agentId,
        createdByAgentId: ctx.agentId,
        config: {
          ...(maxConcurrentTasks !== undefined ? { maxConcurrentTasks } : {}),
          recovery: {
            maxAttemptsPerTask: resolveOrchestrationWorkflowAttemptBudget(params.maxIterations),
          },
          ...(scheduleConfig ? { schedule: scheduleConfig } : {}),
        },
        // `maxIterations` caps attempts on one Work; it is deliberately not
        // passed as `maxRounds`, which counts runs across every Work in the
        // graph and would strand later tasks that have not run at all.
        // Structured criteria persist alongside the prose requirement so the
        // goal page can edit them and the terminal acceptance runs exactly them.
        criteria,
        maxTotalCost: params.maxTotalCost ?? undefined,
        // No seed work: the coordinator plans the decomposition on first
        // advance, turning a complex ask into several explorable directions.
        problemDescription: params.instruction,
        requirement: buildOrchestrationWorkflowRequirement(
          params.name,
          criteria,
          params.instruction,
        ),
        title: params.name,
      });

      return await this.reportCreatedGoal(graph, criteria.length, params.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create the goal';
      return {
        content: `Could not create the goal: ${message}`,
        error: { message, type: 'GoalCreateFailed' },
        state: { name: params.name, success: false },
        success: false,
      };
    }
  };

  /**
   * The goal is committed by the time this runs, so kickoff failure must never
   * be reported as creation failure: an agent told the goal was not created
   * makes another one, and both then do the same paid work. `goal.create`
   * already queued an advance server-side, so a failure here costs nothing more
   * than the immediate feedback.
   */
  private reportCreatedGoal = async (
    graph: OrchestrationWorkflowGraphSnapshot,
    criteriaCount: number,
    name: string,
  ): Promise<BuiltinToolResult> => {
    const created = `Goal "${graph.orchestrationWorkflow.title}" created with ${criteriaCount} acceptance criteria.`;
    const tail =
      'Execution continues in its own task; do not perform or reproduce the work in this conversation.';

    try {
      const advance = await orchestrationWorkflowService.advance(graph.orchestrationWorkflow.id);
      return {
        content: `${created} ${advance.message}. ${tail}`,
        state: {
          orchestrationWorkflowId: graph.orchestrationWorkflow.id,
          name,
          startedAt: new Date().toISOString(),
          success: true,
          taskId: advance.taskId,
        },
        success: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start it right away';
      return {
        content: `${created} It has not started yet (${message}); the server will pick it up. Do not create it again. ${tail}`,
        state: {
          orchestrationWorkflowId: graph.orchestrationWorkflow.id,
          name,
          startedAt: new Date().toISOString(),
          success: true,
        },
        success: true,
      };
    }
  };
}

export const goalExecutor = new GoalExecutor();
