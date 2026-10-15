import type { TaskItem } from '@orvilo/types';

import { GoalModel } from '@/database/models/goal';
import { TaskModel } from '@/database/models/task';
import type { OrviloDatabase } from '@/database/type';

/**
 * Whether running this task requires an agent engine that can mount the
 * per-run builtin/MCP tool surface (`orvilo_cc`).
 *
 * Mirrors the contract-tool derivation in `TaskRunnerService.runTask`: the
 * contract carries the builtin *tools* (legacy
 * agent-mode Brief) that only mount via `session/new` `mcpServers` — builtin
 * *skills* (`orvilo-task-skill`) mount as capability text on any harness and
 * never gate. Goal-bound tasks are goal-mode work outright, so they require
 * the surface for task coordination.
 *
 * Selection and binding gates check this BEFORE minting a dispatch; the
 * `requiredToolIds` admission throw stays as the defense-in-depth backstop.
 */
export const taskRequiresBuiltinToolMount = async (
  db: OrviloDatabase,
  task: TaskItem,
  principal: { userId: string; workspaceId?: string },
): Promise<boolean> => {
  const { userId, workspaceId } = principal;

  if (await new GoalModel(db, userId, workspaceId).findByGraphTask(task.id)) return true;

  const taskModel = new TaskModel(db, userId, workspaceId);
  const briefMode =
    (task.config as { brief?: { mode?: string } } | null)?.brief?.mode === 'agent'
      ? 'agent'
      : 'auto';
  const checkpoint = taskModel.getCheckpointConfig(task);
  return briefMode === 'agent' && checkpoint.onAgentRequest !== false;
};
