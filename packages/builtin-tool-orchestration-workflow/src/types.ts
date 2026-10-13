export type {
  CreateOrchestrationWorkflowParams,
  CreateOrchestrationWorkflowState,
  OrchestrationWorkflowCriterionDraft,
} from '@orvilo/builtin-tool-task';

export const OrchestrationWorkflowApiName = {
  prepareOrchestrationWorkflow: 'prepareOrchestrationWorkflow',
  postOrchestrationWorkflowPlan: 'postOrchestrationWorkflowPlan',
  startOrchestrationWorkflow: 'startOrchestrationWorkflow',
} as const;

export type OrchestrationWorkflowApiNameType =
  (typeof OrchestrationWorkflowApiName)[keyof typeof OrchestrationWorkflowApiName];
