import {
  CreateGoalInspector,
  CreateGoalRender,
  TaskInterventions,
} from '@orvilo/builtin-tool-task/client';
import type { BuiltinInspector, BuiltinIntervention, BuiltinRender } from '@orvilo/types';

import {
  OrchestrationWorkflowIdentifier,
  OrchestrationWorkflowManifest,
} from '../../../builtin-tool-orchestration-workflow/src/manifest';
import { OrchestrationWorkflowApiName } from '../../../builtin-tool-orchestration-workflow/src/types';

export const OrchestrationWorkflowInspectors: Record<string, BuiltinInspector> = {
  [OrchestrationWorkflowApiName.startOrchestrationWorkflow]:
    CreateGoalInspector as BuiltinInspector,
};

export const OrchestrationWorkflowInterventions: Record<string, BuiltinIntervention> = {
  [OrchestrationWorkflowApiName.startOrchestrationWorkflow]:
    TaskInterventions.startOrchestrationWorkflow as BuiltinIntervention,
};

export const OrchestrationWorkflowRenders: Record<string, BuiltinRender> = {
  [OrchestrationWorkflowApiName.startOrchestrationWorkflow]: CreateGoalRender as BuiltinRender,
};

export { OrchestrationWorkflowIdentifier, OrchestrationWorkflowManifest };
export { OrchestrationWorkflowSupervisorManifest } from '../../../builtin-tool-orchestration-workflow/src/supervisor';
export * from '../../../builtin-tool-orchestration-workflow/src/types';
export { OrchestrationWorkflowSupervisorInspectors } from './supervisorInspector';
