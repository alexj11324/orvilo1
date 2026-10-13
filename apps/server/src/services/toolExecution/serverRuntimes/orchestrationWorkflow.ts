import {
  buildOrchestrationWorkflowRequirement,
  OrchestrationWorkflowIdentifier,
  resolveOrchestrationWorkflowAttemptBudget,
  resolveOrchestrationWorkflowConcurrency,
  resolveOrchestrationWorkflowScheduleConfig,
} from '@orvilo/builtin-tool-orchestration-workflow';

import { AgentModel } from '@/database/models/agent';
import { OrchestrationWorkflowService } from '@/server/services/orchestrationWorkflow';
import { advanceOrchestrationWorkflow } from '@/server/services/orchestrationWorkflow/advanceOrchestrationWorkflow';
import { scheduleOrchestrationWorkflowAdvance } from '@/server/services/orchestrationWorkflow/scheduler';

import type { ServerRuntimeRegistration } from './types';

/**
 * Server-side `startOrchestrationWorkflow`: create a OrchestrationWorkflow Graph and advance it once.
 *
 * It lives in its own runtime rather than on the task runtime because a orchestration workflow is
 * no longer a task with a `orchestration workflows` row attached — the graph owns the
 * decomposition and dispatches its own Work Tasks.
 */
export const orchestrationWorkflowRuntime: ServerRuntimeRegistration = {
  factory: (context) => {
    if (!context.userId || !context.serverDB) {
      throw new Error('userId and serverDB are required for Orchestration workflow tool execution');
    }
    const { agentId, serverDB, userId, workspaceId } = context;

    return {
      startOrchestrationWorkflow: async (args: {
        criteria: Array<{ description?: string; instruction?: string; title: string }>;
        deadline?: string | null;
        instruction: string;
        maxConcurrentTasks?: number | null;
        maxIterations?: number | null;
        maxTotalCost?: number | null;
        name: string;
      }) => {
        if (!context.orchestrationWorkflowPlanApproved) {
          return {
            content:
              'The complete orchestration workflow plan must be confirmed by the person first.',
            success: false,
          };
        }
        const orchestratorAgentId = await new AgentModel(
          serverDB,
          userId,
          workspaceId ?? undefined,
        ).getOrchestratorSourceAgentId();
        if (agentId !== orchestratorAgentId) {
          return {
            content: 'Only the workspace Orchestrator may start an orchestration workflow.',
            success: false,
          };
        }

        const drafts = (args.criteria ?? []).filter((item) => item.title?.trim());
        if (drafts.length === 0) {
          return {
            content: 'An orchestration workflow needs at least one acceptance criterion.',
            success: false,
          };
        }

        try {
          const orchestrationWorkflowService = new OrchestrationWorkflowService(
            serverDB,
            userId,
            workspaceId ?? undefined,
          );
          const scheduleConfig = resolveOrchestrationWorkflowScheduleConfig(args.deadline);
          const maxConcurrentTasks = resolveOrchestrationWorkflowConcurrency(
            args.maxConcurrentTasks,
          );
          const graph = await orchestrationWorkflowService.create({
            agentId,
            createdByAgentId: agentId,
            config: {
              ...(maxConcurrentTasks !== undefined ? { maxConcurrentTasks } : {}),
              recovery: {
                maxAttemptsPerTask: resolveOrchestrationWorkflowAttemptBudget(args.maxIterations),
              },
              ...(scheduleConfig ? { schedule: scheduleConfig } : {}),
            },
            // `maxIterations` caps attempts on one Work; it is deliberately not
            // passed as `maxRounds`, which counts runs across every Work in the
            // graph and would strand later tasks that have not run at all.
            // Structured criteria persist alongside the prose requirement so the
            // orchestration workflow page can edit them and the terminal acceptance runs exactly them.
            criteria: drafts,
            maxTotalCost: args.maxTotalCost ?? undefined,
            // No seed work: the coordinator plans the decomposition on first
            // advance, so a complex ask becomes several explorable directions
            // instead of one task that mirrors the whole request.
            problemDescription: args.instruction,
            requirement: buildOrchestrationWorkflowRequirement(args.name, drafts, args.instruction),
            title: args.name,
          });
          // The TRPC `orchestrationWorkflow.create` route queues this; calling the service
          // directly does not. Without it the "the server will pick it up"
          // promise below is false — outside queue mode there is no local timer
          // for the orchestration workflow and no recurring sweep, so it would sit in `planning`
          // while the agent has been told not to create it again.
          await scheduleOrchestrationWorkflowAdvance({
            orchestrationWorkflowId: graph.orchestrationWorkflow.id,
            trigger: 'create',
            userId,
            workspaceId: workspaceId ?? undefined,
          });

          const created = `Orchestration workflow "${graph.orchestrationWorkflow.title}" created with ${drafts.length} acceptance criteria.`;
          const tail =
            'Execution continues in its own task; do not perform or reproduce the work in this conversation.';

          // The orchestration workflow is committed. Kickoff failure must not be reported as
          // creation failure — an agent told the orchestration workflow was not created makes
          // another one, and both then do the same paid work. `orchestrationWorkflow.create`
          // already queued an advance, so this is only about immediate feedback.
          try {
            // Advance until the coordinator is waiting on something other than a
            // tick — normally that is the first Work Task executing. From there
            // the orchestration workflow keeps itself moving through the queued advances.
            const { result } = await advanceOrchestrationWorkflow({
              orchestrationWorkflowId: graph.orchestrationWorkflow.id,
              trigger: 'create',
              userId,
              workspaceId: workspaceId ?? undefined,
            });

            return {
              content: `${created} ${result.message}. ${tail}`,
              state: {
                orchestrationWorkflowId: graph.orchestrationWorkflow.id,
                name: args.name,
                startedAt: new Date().toISOString(),
                success: true,
                taskId: result.taskId,
              },
              success: true,
            };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : 'Could not start it right away';
            return {
              content: `${created} It has not started yet (${message}); the server will pick it up. Do not create it again. ${tail}`,
              state: {
                orchestrationWorkflowId: graph.orchestrationWorkflow.id,
                name: args.name,
                startedAt: new Date().toISOString(),
                success: true,
              },
              success: true,
            };
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Failed to create the orchestration workflow';
          return {
            content: `Could not create the orchestration workflow: ${message}`,
            state: { name: args.name, success: false },
            success: false,
          };
        }
      },
    };
  },
  identifier: OrchestrationWorkflowIdentifier,
};
