import { canMountBuiltinToolSurface } from '@orvilo/heterogeneous-agents';

import { AgentModel } from '@/database/models/agent';
import { TaskModel } from '@/database/models/task';
import type { OrviloDatabase } from '@/database/type';
import { assertCanUseWorkspaceAgent } from '@/server/routers/lambda/_helpers/workspaceAgentGuard';
import { AcpJudgmentBindingError } from '@/server/services/aiGeneration/judgment';

/** Read the live Issue binding; acceptance policies and parent runs never select a reviewer. */
export const resolveIssueReviewer = async (
  db: OrviloDatabase,
  userId: string,
  taskId: string | null | undefined,
  workspaceId?: string,
): Promise<string> => {
  const task = taskId ? await new TaskModel(db, userId, workspaceId).findById(taskId) : null;
  const agentId = task?.reviewerAgentId;
  if (!agentId)
    throw new AcpJudgmentBindingError('Issue verification', 'Set a reviewer Agent on the Issue.');
  await assertCanUseWorkspaceAgent({ agentId, db, userId, workspaceId });
  const agent = await new AgentModel(db, userId, workspaceId).getAgentConfigForExecution(agentId);
  if (!agent)
    throw new AcpJudgmentBindingError(
      'Issue verification',
      'The Issue reviewer Agent is unavailable.',
    );
  if (!canMountBuiltinToolSurface(agent.agencyConfig?.heterogeneousProvider))
    throw new AcpJudgmentBindingError(
      'Issue verification',
      'The Issue reviewer runtime cannot mount submitVerifyResult. Choose a supported reviewer Agent or accept manually.',
    );
  return agentId;
};
