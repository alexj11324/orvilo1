import { OrchestrationWorkflowSupervisorIdentifier } from '@orvilo/builtin-tool-orchestration-workflow';

import { OrchestrationWorkflowSupervisorTools } from '@/server/services/orchestrationWorkflow/supervisor/tools';

import type { ServerRuntimeRegistration } from './types';

export const orchestrationWorkflowSupervisorRuntime: ServerRuntimeRegistration = {
  identifier: OrchestrationWorkflowSupervisorIdentifier,
  factory: (context) => {
    if (!context.serverDB || !context.userId)
      throw new Error('Supervisor database context required');
    return new OrchestrationWorkflowSupervisorTools(context);
  },
};
