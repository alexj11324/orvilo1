import type { ProjectOrchestrationPolicy } from '@orvilo/types';

// Leaf module: policy normalization is a pure transform shared by ProjectModel
// and TaskDispatchModel — keeping it here keeps `taskDispatch → project` out of
// the model import graph (which dpdm rejects for cycles).

export const DEFAULT_PROJECT_ORCHESTRATION_POLICY: ProjectOrchestrationPolicy = {
  autoDispatch: false,
  concurrencyLimit: 1,
  executionBudget: { maxCost: 25, maxRuns: 10 },
  planningBudget: { maxRevisions: 20 },
  replanMode: 'disabled',
  requireHumanReview: true,
};

export const normalizeProjectOrchestrationPolicy = (
  policy: Partial<ProjectOrchestrationPolicy> | null | undefined,
): ProjectOrchestrationPolicy => ({
  allowedAgentIds:
    policy?.allowedAgentIds === undefined
      ? undefined
      : [...new Set(policy.allowedAgentIds.filter(Boolean))],
  allowedRoles:
    policy?.allowedRoles === undefined
      ? undefined
      : [...new Set(policy.allowedRoles.map((role) => role.trim()).filter(Boolean))],
  autoDispatch: policy?.autoDispatch ?? DEFAULT_PROJECT_ORCHESTRATION_POLICY.autoDispatch,
  concurrencyLimit:
    policy?.concurrencyLimit ?? DEFAULT_PROJECT_ORCHESTRATION_POLICY.concurrencyLimit,
  executionBudget: {
    maxCost:
      policy?.executionBudget?.maxCost ??
      DEFAULT_PROJECT_ORCHESTRATION_POLICY.executionBudget!.maxCost,
    maxRuns:
      policy?.executionBudget?.maxRuns ??
      DEFAULT_PROJECT_ORCHESTRATION_POLICY.executionBudget!.maxRuns,
  },
  planningBudget: {
    maxRevisions:
      policy?.planningBudget?.maxRevisions ??
      DEFAULT_PROJECT_ORCHESTRATION_POLICY.planningBudget!.maxRevisions,
  },
  replanMode: policy?.replanMode ?? DEFAULT_PROJECT_ORCHESTRATION_POLICY.replanMode,
  requireHumanReview:
    policy?.requireHumanReview ?? DEFAULT_PROJECT_ORCHESTRATION_POLICY.requireHumanReview,
});
