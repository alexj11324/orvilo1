import { evaluateFeatureFlag } from '@/config/featureFlags';

import { getServerFeatureFlagsFromRuntimeConfig } from './index';

/**
 * CAID admission gate — rollout control for NEW orchestrated dispatches.
 *
 * A dispatch counts as CAID-orchestrated when the task-runner entry is reached
 * with `trigger: 'goal'` (goal frontier fan-out, goal-driven resumes) or
 * `trigger: 'orchestrator'` (planner intents, dependency-cascade follow-ons).
 * Front entries judge admission before waking anything, and
 * `TaskDispatchService.prepare` re-checks it at the shared claim boundary —
 * the last point every new claim funnels through — so a flip between a
 * front-check and the final dispatch cannot leak a new writer.
 *
 * What stays ungated by design (the flag only blocks *new* CAID dispatch):
 * - `manual` runs, including integration corrective/delivery-settlement runs —
 *   an in-flight orchestration must still settle after the flag turns off.
 * - `schedule` / `heartbeat` wakes — per-task automation, not orchestration.
 * - Cancellations, reads, and existing-run state transitions everywhere.
 *   (A goal recovery resume is itself a new claim: with the flag off it is
 *   held `waiting` like any other orchestrated dispatch, not exempted.)
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
