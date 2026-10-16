import { taskExecutor } from '@orvilo/builtin-tool-task/client/executor';
import type { BuiltinToolResult, ToolAfterCallContext } from '@orvilo/types';
import { BaseExecutor } from '@orvilo/types';

import { OrchestrationWorkflowIdentifier } from '../../manifest';
import { OrchestrationWorkflowApiName } from '../../types';

/**
 * The prepare / post / start protocol is a server transaction: `prepare` and
 * `post` write the split into the Orchestrator conversation, and `start` is
 * released only by a later user reply in that same topic. None of that state is
 * reachable from the client, so the manifest is server-only and this executor
 * must never create or release a workflow itself. It rejects every call with an
 * explicit error (instead of the retired one-shot creation payload, which
 * misread the ID-only `start` call as a missing `criteria` array) and keeps
 * only the task-refresh hook.
 */
const serverOnly = async (): Promise<BuiltinToolResult> => ({
  content:
    'Orchestration workflow tools run on the server inside the Orchestrator conversation; they cannot be executed on the client.',
  error: {
    message: 'Orchestration workflow tools are server-runtime only',
    type: 'ServerRuntimeOnly',
  },
  success: false,
});

class OrchestrationWorkflowExecutor extends BaseExecutor<typeof OrchestrationWorkflowApiName> {
  readonly identifier = OrchestrationWorkflowIdentifier;
  protected readonly apiEnum = OrchestrationWorkflowApiName;

  onAfterCall = async (context: ToolAfterCallContext): Promise<void> => {
    await taskExecutor.onAfterCall(context);
  };

  prepareOrchestrationWorkflow = serverOnly;
  postOrchestrationWorkflowPlan = serverOnly;
  startOrchestrationWorkflow = serverOnly;
}

export const goalExecutor = new OrchestrationWorkflowExecutor();
