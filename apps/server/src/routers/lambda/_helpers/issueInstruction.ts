import type { TaskItem } from '@orvilo/types';
import { TRPCError } from '@trpc/server';

import type { TaskTopicModel } from '@/database/models/taskTopic';
import type { OrviloDatabase } from '@/database/type';

import { assertIssueExecutionInput } from './issueExecutionInput';
import { assertCanUseOperationAgent } from './nativeInterventionInput';

/** Activity input follows current authorization but keeps the Run's sealed execution identity. */
export const resolveIssueInstructionTarget = async (
  ctx: {
    serverDB: OrviloDatabase;
    userId: string;
    workspaceId?: string | null;
    taskTopicModel: Pick<TaskTopicModel, 'findByTopicId'>;
  },
  task: Pick<TaskItem, 'id' | 'assigneeAgentId' | 'assigneeUserId' | 'currentTopicId'>,
  input: { agentId?: string; topicId?: string } = {},
) => {
  if (!task.assigneeAgentId || (input.agentId && input.agentId !== task.assigneeAgentId))
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Use the current assigned Agent' });
  if (input.topicId && input.topicId !== task.currentTopicId)
    throw new TRPCError({ code: 'CONFLICT', message: 'Reply to the current Issue Run' });
  const topicId = input.topicId ?? task.currentTopicId;
  if (!topicId) {
    await assertIssueExecutionInput(ctx, task);
    return { agentId: task.assigneeAgentId, executionUserId: ctx.userId };
  }
  const run = await ctx.taskTopicModel.findByTopicId(topicId);
  if (run?.taskId !== task.id || !run.operationId)
    throw new TRPCError({ code: 'CONFLICT', message: 'The Issue Run is no longer current' });
  const operation = await assertCanUseOperationAgent({
    db: ctx.serverDB,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    operationId: run.operationId,
    topicId,
  });
  if (operation.agentId !== task.assigneeAgentId)
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'The Issue executor changed; open its current Run',
    });
  return { agentId: operation.agentId, executionUserId: operation.userId, topicId };
};
