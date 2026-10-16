import type { AcceptanceConfig, TaskVerifyConfig } from '@orvilo/types';

import { AcceptanceModel } from '@/database/models/acceptance';
import { ProjectModel } from '@/database/models/project';
import { TaskModel } from '@/database/models/task';
import type { AcceptanceItem } from '@/database/schemas/verify';
import type { OrviloDatabase } from '@/database/type';

export interface ResolvedTaskAcceptance {
  acceptance: AcceptanceItem;
  config: AcceptanceConfig;
  requirement?: string;
}

const toAcceptanceConfig = (verify: TaskVerifyConfig): AcceptanceConfig => ({
  enabled: verify.enabled,
  maxIterations: verify.maxIterations,
  verifyCriteriaIds: verify.verifyCriteriaIds,
  verifyRubricId: verify.verifyRubricId,
});

/**
 * Resolve the Acceptance that owns a Task's completion contract.
 *
 * Return only persisted historical policies. Reading legacy task config or an
 * inherited policy must never materialize or update Acceptance rows.
 */
export const resolveTaskAcceptance = async (
  db: OrviloDatabase,
  userId: string,
  taskId: string,
  workspaceId?: string,
): Promise<ResolvedTaskAcceptance | undefined> => {
  const acceptanceModel = new AcceptanceModel(db, userId, workspaceId);
  const taskModel = new TaskModel(db, userId, workspaceId);
  const ownAcceptance = await acceptanceModel.findPolicyBySubject('task', taskId);
  const seen = new Set<string>();
  let currentTaskId: string | null = taskId;
  let inheritedConfig: AcceptanceConfig | undefined;
  let inheritedRequirement: string | undefined;
  let policyAcceptance: AcceptanceItem | undefined;

  while (currentTaskId && !seen.has(currentTaskId)) {
    seen.add(currentTaskId);
    const task = await taskModel.findById(currentTaskId);
    if (!task) break;
    if (
      task.projectId &&
      !(await new ProjectModel(db, userId, workspaceId).findById(task.projectId))
    )
      return undefined;

    const acceptance =
      currentTaskId === taskId
        ? ownAcceptance
        : await acceptanceModel.findPolicyBySubject('task', currentTaskId);
    const acceptanceConfig = acceptance?.config ?? {};
    const acceptanceRequirement = acceptance?.requirement?.trim() || undefined;
    if (Object.keys(acceptanceConfig).length > 0 || acceptanceRequirement) {
      policyAcceptance = acceptance;
      inheritedConfig = acceptanceConfig;
      inheritedRequirement = acceptanceRequirement;
      break;
    }

    const legacyVerify = taskModel.getVerifyConfig(task);
    if (legacyVerify) {
      inheritedConfig = toAcceptanceConfig(legacyVerify);
      inheritedRequirement = legacyVerify.requirement?.trim() || undefined;
      break;
    }

    currentTaskId = task.parentTaskId;
  }

  if (!inheritedConfig && !inheritedRequirement) return undefined;

  if (policyAcceptance && currentTaskId === taskId) {
    return {
      acceptance: policyAcceptance,
      config: policyAcceptance.config ?? {},
      requirement: policyAcceptance.requirement ?? undefined,
    };
  }

  // Historical reads never create or synchronize a child policy.
  if (!policyAcceptance) return undefined;
  const acceptance = policyAcceptance;

  return {
    acceptance,
    config: acceptance.config ?? {},
    requirement: acceptance.requirement ?? undefined,
  };
};
