import type { TaskItem } from '@orvilo/types';

import { TaskModel } from '@/database/models/task';
import type { OrviloDatabase } from '@/database/type';

/**
 * Whether running this task requires an agent engine that can mount the
 * per-run builtin/MCP tool surface (`orvilo_cc`).
 *
 * Mirrors the contract-tool derivation in `TaskRunnerService.runTask`: the
 * agent-mode Brief tool mounts via `session/new` `mcpServers`. Builtin
 * skills (`orvilo-task-skill`) mount as capability text on any harness.
 * Historical Goal and Acceptance settings no longer gate ordinary tasks.
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

  const taskModel = new TaskModel(db, userId, workspaceId);
  const briefMode =
    (task.config as { brief?: { mode?: string } } | null)?.brief?.mode === 'agent'
      ? 'agent'
      : 'auto';
  const checkpoint = taskModel.getCheckpointConfig(task);
  return briefMode === 'agent' && checkpoint.onAgentRequest !== false;
};
