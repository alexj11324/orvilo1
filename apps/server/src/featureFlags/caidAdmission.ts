import { evaluateFeatureFlag } from '@/config/featureFlags';

import { getServerFeatureFlagsFromRuntimeConfig } from './index';

/**
 * CAID admission gate — rollout control for NEW orchestrated dispatches.
 *
 * A dispatch counts as CAID-orchestrated when the task-runner entry is reached
 * with `trigger: 'goal'` (goal frontier fan-out, goal-driven resumes) or
 * `trigger: 'orchestrator'` (planner intents). Those entries judge admission
 * here before claiming or waking anything.
 *
 * What stays ungated by design (the flag only blocks *new* CAID dispatch):
 * - `manual` runs, including integration corrective/delivery-settlement runs —
 *   an in-flight orchestration must still settle after the flag turns off.
 * - `schedule` / `heartbeat` wakes — per-task automation, not orchestration.
 * - `taskRecoveryCoordinator` resumes of already-running orchestration.
 * - Cancellations, reads, and existing-run state transitions everywhere.
 *
 * Enabled when the deployment flag is `true`, the caller's user id is in the
 * `caid_dispatch` allowlist, or the caller's workspace is in
 * `caid_dispatch_workspaces`. All three are runtime-config/env driven; the
 * default is off.
 */
export const isCaidDispatchAllowed = async (input: {
  userId?: string;
  workspaceId?: string | null;
}): Promise<boolean> => {
  const flags = await getServerFeatureFlagsFromRuntimeConfig(input.userId);

  if (evaluateFeatureFlag(flags.caid_dispatch, input.userId) === true) return true;

  // A per-user boolean override can squash the workspace list — guard the type.
  const workspaces = flags.caid_dispatch_workspaces;
  return (
    input.workspaceId != null && Array.isArray(workspaces) && workspaces.includes(input.workspaceId)
  );
};
