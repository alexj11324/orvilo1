import type { TaskItem } from '@orvilo/types';

import { GoalModel } from '@/database/models/goal';
import { TaskModel } from '@/database/models/task';
import type { OrviloDatabase } from '@/database/type';
import { resolveTaskAcceptance } from '@/server/services/verify/taskAcceptance';

/**
 * Whether running this task requires an agent engine that can mount the
 * per-run builtin/MCP tool surface (`orvilo_cc`).
 *
 * Mirrors the contract-tool derivation in `TaskRunnerService.runTask`: the
 * contract carries the builtin *tools* (Acceptance evidence, legacy
 * agent-mode Brief) that only mount via `session/new` `mcpServers` — builtin
 * *skills* (`orvilo-task-skill`) mount as capability text on any harness and
 * never gate. Goal-bound tasks are goal-mode work outright, so they require
 * the surface even if their acceptance policy is later disabled.
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

  // Same skip as buildTaskPrompt: automation-owned tasks never resolve an
  // acceptance policy into the run contract.
  if (!task.automationMode) {
    const acceptance = await resolveTaskAcceptance(db, userId, task.id, workspaceId).catch(
      () => undefined,
    );
    if (acceptance && acceptance.config.enabled !== false) return true;
  }

  const taskModel = new TaskModel(db, userId, workspaceId);
  const briefMode =
    (task.config as { brief?: { mode?: string } } | null)?.brief?.mode === 'agent'
      ? 'agent'
      : 'auto';
  const reviewConfig = taskModel.getReviewConfig(task);
  const checkpoint = taskModel.getCheckpointConfig(task);
  return briefMode === 'agent' && !reviewConfig?.enabled && checkpoint.onAgentRequest !== false;
};
