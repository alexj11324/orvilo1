import { evaluateFeatureFlag } from '@/config/featureFlags';

import { getServerFeatureFlagsFromRuntimeConfig } from './index';

/**
 * Prime embedded harness dispatch gate (phase 5a).
 *
 * When enabled, `dispatchHeteroAgent` routes own-agent runs
 * (`type:'orvilo'` sandbox-planned task dispatches only — heterogeneous/ACP
 * kinds never match) through the canonical `CanonicalCoreRuntimeHost` with
 * the embedded Prime runtime instead of the cloud sandbox spawn.
 *
 * The flag exists so the seam can ship dark: the deployment default is off,
 * and an admin can turn it on per deployment (`true`), per user (id list),
 * or back off at runtime without a redeploy (the kill switch) — the design
 * intent is for own-agent runs to move to the embedded harness eventually,
 * and this is the reversible path there.
 *
 * Settle/cancel paths are unaffected either way: a run that started on one
 * side finishes on that side — this only selects the launch path.
 */
export const isPrimeEmbeddedDispatchEnabled = async (input: {
  userId?: string;
}): Promise<boolean> => {
  const flags = await getServerFeatureFlagsFromRuntimeConfig(input.userId);
  return evaluateFeatureFlag(flags.prime_embedded_dispatch, input.userId) === true;
};
