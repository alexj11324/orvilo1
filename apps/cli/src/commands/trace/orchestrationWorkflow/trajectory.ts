import {
  loadOrchestrationWorkflowTrajectory,
  type OrchestrationWorkflowTrajectory,
} from '@orvilo/agent-tracing';
import { TRPCClientError } from '@trpc/client';

import { getTrpcClient } from '../../../api/client';
import { log } from '../../../utils/logger';

/**
 * Resolve the trajectory a `orvilo trace orchestration workflow` subcommand was pointed at, or exit
 * with a message that says what to do about it.
 *
 * Unlike an operation snapshot there is no `TRACING_BASE_URL` fallback: a orchestration workflow
 * trajectory's key lives on `orchestration_workflow_traces` and cannot be derived from the orchestration workflow
 * id, so the server is the only way in. That is a feature — inspecting a
 * production orchestration workflow needs a Orvilo login and nothing else.
 */
export const resolveTrajectoryOrExit = async (
  target: string,
): Promise<OrchestrationWorkflowTrajectory> => {
  // Why the server declined, kept so the final message can say "no trajectory
  // recorded" rather than "not found locally".
  let serverReason: string | undefined;

  const resolveDownloadUrl = async (orchestrationWorkflowId: string): Promise<string | null> => {
    const client = await getTrpcClient();

    try {
      const { data } = await client.agentTrace.getOrchestrationWorkflowTrajectoryUrl.query({
        orchestrationWorkflowId,
      });
      return data.url;
    } catch (error) {
      // NOT_FOUND means the orchestration workflow is absent, outside the caller's scope, or
      // recorded nothing — all "nothing to download". Anything else (auth,
      // network, a signing failure) is real and must not be swallowed.
      if (error instanceof TRPCClientError && error.data?.code === 'NOT_FOUND') {
        serverReason = error.message;
        return null;
      }
      throw error;
    }
  };

  try {
    const trajectory = await loadOrchestrationWorkflowTrajectory(target, {
      allowDownload: true,
      resolveDownloadUrl,
    });
    if (trajectory) return trajectory;

    log.error(
      serverReason ??
        `No trajectory found for "${target}". Run \`orvilo trace orchestration-workflow list\` to see which orchestration workflows have one.`,
    );
  } catch (error) {
    log.error(error instanceof Error ? error.message : String(error));
  }
  process.exit(1);
};
