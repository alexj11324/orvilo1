import {
  FileOrchestrationWorkflowTraceStore,
  type IOrchestrationWorkflowTraceStore,
} from '@orvilo/agent-tracing';

import { S3OrchestrationWorkflowTraceStore } from '@/server/modules/OrchestrationWorkflowTracing';

import { shouldUseAgentS3Tracing } from '../agentExecution/snapshotStore';

/**
 * Constructor injection for tests. Defaults are statically imported — never
 * load them through a dynamic `require(moduleName)`, which defeats the
 * bundler's `@/` alias resolution and silently yields a null store.
 */
export interface OrchestrationWorkflowTraceStoreFactories {
  createFile?: () => IOrchestrationWorkflowTraceStore;
  createS3?: () => IOrchestrationWorkflowTraceStore;
}

/**
 * OrchestrationWorkflow trajectories follow the same switch as operation snapshots, so a
 * deployment that records one records the other and a orchestration workflow trace never points
 * at operation traces that were not kept.
 */
export const createDefaultOrchestrationWorkflowTraceStore = (
  factories: OrchestrationWorkflowTraceStoreFactories = {},
): IOrchestrationWorkflowTraceStore | null => {
  if (shouldUseAgentS3Tracing()) {
    try {
      return (factories.createS3 ?? (() => new S3OrchestrationWorkflowTraceStore()))();
    } catch (error) {
      // Best-effort, but loud: a swallowed failure here would leave production
      // orchestration workflows with no trajectory and no sign of why.
      console.error(
        '[orchestrationWorkflowTraceStore] failed to create S3OrchestrationWorkflowTraceStore, tracing disabled:',
        error,
      );
      return null;
    }
  }

  if (process.env.NODE_ENV === 'development') {
    return (factories.createFile ?? (() => new FileOrchestrationWorkflowTraceStore()))();
  }

  return null;
};
