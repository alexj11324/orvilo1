import { TRPCError } from '@trpc/server';

import type { OrviloDatabase } from '@/database/type';

import { assertCanUseWorkspaceAgent } from './workspaceAgentGuard';

/** Current assignees may continue a Run; its execution identity stays with its owner. */
export const assertIssueExecutionInput = async (
  ctx: { serverDB: OrviloDatabase; userId: string; workspaceId?: string | null },
  task: { assigneeAgentId: string | null; assigneeUserId: string | null },
  agentId: string | null = task.assigneeAgentId,
) => {
  if (
    !agentId ||
    (task.assigneeUserId ? task.assigneeUserId !== ctx.userId : task.assigneeAgentId !== agentId)
  ) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Execution input requires the current assignee scope',
    });
  }
  await assertCanUseWorkspaceAgent({
    agentId,
    db: ctx.serverDB,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });
};
