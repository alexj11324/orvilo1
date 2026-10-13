import type { OrchestrationWorkflowCriterionDraft } from '@orvilo/builtin-tool-task';

import type { VerifyCriterionDraft } from '@/services/verify';
import { verifyService } from '@/services/verify';

interface GenerateGoalCriteriaParams {
  /** The agent the goal is being created for, when the opener supplied one. */
  agentId?: string;
  context?: string;
  orchestrationWorkflow: string;
}

export interface GeneratedGoalPlan {
  criteria: OrchestrationWorkflowCriterionDraft[];
  instruction: string;
  title: string;
}

export const withGoalCriterionDefaults = (
  draft: VerifyCriterionDraft,
): OrchestrationWorkflowCriterionDraft => ({
  ...draft,
  onFail: draft.onFail ?? 'auto_repair',
  required: draft.required ?? true,
  verifierType: draft.verifierType ?? 'agent',
});

export const createFallbackGoalCriterion = (
  orchestrationWorkflow: string,
): OrchestrationWorkflowCriterionDraft => ({
  onFail: 'auto_repair',
  required: true,
  title: orchestrationWorkflow,
  verifierType: 'agent',
});

export const generateOrchestrationWorkflowCriteria = async ({
  agentId,
  context,
  orchestrationWorkflow,
}: GenerateGoalCriteriaParams): Promise<GeneratedGoalPlan> => {
  const generated = await verifyService.generateOrchestrationWorkflowPlan({
    agentId,
    context,
    orchestrationWorkflow,
    maxCriteria: 8,
  });

  if (!generated || generated.criteria.length === 0) throw new Error('No goal plan was generated.');

  return {
    ...generated,
    criteria: generated.criteria.map(withGoalCriterionDefaults),
    instruction: generated.instruction.trim() || orchestrationWorkflow.trim(),
  };
};
