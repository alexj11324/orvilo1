import {
  buildOrchestrationWorkflowRequirement,
  OrchestrationWorkflowIdentifier,
  resolveOrchestrationWorkflowAttemptBudget,
  resolveOrchestrationWorkflowConcurrency,
  resolveOrchestrationWorkflowScheduleConfig,
} from '@orvilo/builtin-tool-orchestration-workflow';

import { advanceOrchestrationWorkflow } from '@/server/services/orchestrationWorkflow/advanceOrchestrationWorkflow';
import {
  OrchestrationWorkflowConversationPlanService,
  type OrchestrationWorkflowSplitTask,
} from '@/server/services/orchestrationWorkflow/conversationPlan';
import { scheduleOrchestrationWorkflowAdvance } from '@/server/services/orchestrationWorkflow/scheduler';

import type { ServerRuntimeRegistration } from './types';

export const orchestrationWorkflowRuntime: ServerRuntimeRegistration = {
  factory: (context) => {
    const { agentId, serverDB, userId, workspaceId, topicId } = context;
    if (!userId || !serverDB) throw new Error('userId and serverDB are required');
    const plans = new OrchestrationWorkflowConversationPlanService(serverDB, userId, workspaceId);
    const conversation = () => {
      if (!agentId || !topicId) throw new Error('An Orchestrator conversation is required');
      return { agentId, topicId };
    };
    return {
      prepareOrchestrationWorkflow: async (args: {
        criteria: Array<{ description?: string; instruction?: string; title: string }>;
        deadline?: string | null;
        instruction: string;
        maxConcurrentTasks?: number | null;
        maxIterations?: number | null;
        maxTotalCost?: number | null;
        name: string;
        tasks: OrchestrationWorkflowSplitTask[];
      }) => {
        const drafts = (args.criteria ?? []).filter((item) => item.title?.trim());
        if (!drafts.length)
          return {
            content: 'An orchestration workflow needs acceptance criteria.',
            success: false,
          };
        const schedule = resolveOrchestrationWorkflowScheduleConfig(args.deadline);
        const concurrency = resolveOrchestrationWorkflowConcurrency(args.maxConcurrentTasks);
        const state = await plans.prepare(
          {
            config: {
              ...(concurrency !== undefined ? { maxConcurrentTasks: concurrency } : {}),
              recovery: {
                maxAttemptsPerTask: resolveOrchestrationWorkflowAttemptBudget(args.maxIterations),
              },
              ...(schedule ? { schedule } : {}),
            },
            criteria: drafts,
            maxTotalCost: args.maxTotalCost ?? undefined,
            problemDescription: args.instruction,
            requirement: buildOrchestrationWorkflowRequirement(args.name, drafts, args.instruction),
            tasks: args.tasks,
            title: args.name,
          },
          conversation(),
        );
        return {
          content: `Orchestration workflow ${state.orchestrationWorkflowId}: parent Issue ${state.parentTaskId} and ${state.taskIds.length} sub-Issues are on the board in Backlog. The complete split is posted in this conversation. Await the person's reply; no execution has started. Do not deliver the work in this conversation.`,
          state: { ...state, name: args.name, success: true, waitingReason: 'plan_not_confirmed' },
          success: true,
        };
      },
      postOrchestrationWorkflowPlan: async (args: { orchestrationWorkflowId: string }) => {
        const state = await plans.post(args.orchestrationWorkflowId, conversation());
        return {
          content: 'Revised split posted. Await a new user reply before release.',
          state,
          success: true,
        };
      },
      startOrchestrationWorkflow: async (args: { orchestrationWorkflowId: string }) => {
        if (!context.messageId)
          return { content: 'A user reply after the posted split is required.', success: false };
        const state = await plans.release(args.orchestrationWorkflowId, {
          ...conversation(),
          sourceMessageId: context.messageId,
        });
        await scheduleOrchestrationWorkflowAdvance({
          orchestrationWorkflowId: state.orchestrationWorkflowId,
          trigger: 'create',
          userId,
          workspaceId,
        });
        try {
          const { result } = await advanceOrchestrationWorkflow({
            orchestrationWorkflowId: state.orchestrationWorkflowId,
            trigger: 'create',
            userId,
            workspaceId,
          });
          return {
            content: `Orchestration workflow released after the user's reply. ${result.message}. Execution belongs to its Issues; do not perform the work in this conversation.`,
            state: { ...state, startedAt: new Date().toISOString(), success: true },
            success: true,
          };
        } catch (error) {
          return {
            content: `Orchestration workflow released; execution is waiting (${error instanceof Error ? error.message : 'dispatch unavailable'}). Do not create it again or deliver the work in chat.`,
            state: { ...state, success: true },
            success: true,
          };
        }
      },
    };
  },
  identifier: OrchestrationWorkflowIdentifier,
};
