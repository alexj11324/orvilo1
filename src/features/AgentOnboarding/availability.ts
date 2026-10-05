import type { HeterogeneousAgentScanMap } from '@orvilo/heterogeneous-agents';
import type { ProviderBinding } from '@orvilo/types';
import { PROVIDER_CONFIG_ANCHOR_MODEL } from '@orvilo/types';

import { collectPrimeModelRoutes } from '@/features/ChatInput/ControlBar/HeteroModel/useComposerModelSource';
import { isBuiltinEngineType } from '@/features/HeterogeneousAgent/engine';

/**
 * The initial gate requires a persisted non-virtual profile. Prime additionally
 * needs an enabled personal model binding; `sandbox` is its inference-binding
 * lookup, not an execution host. Prime runs through Gateway on a chosen device.
 * Final onboarding completion separately verifies the workspace and live device
 * and saves the user's device override after private transfer.
 *
 * Local scans are discovery only: a connected profile may run on another device
 * and must not be duplicated because its CLI is absent on this computer.
 */

/**
 * Harness types that already own an agent row, minus the builtin Orvilo engine.
 *
 * The engine is excluded rather than counted: `collectConnectedHarnessTypes`
 * reads `heterogeneousType` off the sidebar payload, and the builtin's own row
 * carries `orvilo`. Counting it here would report the builtin as a connected
 * CLI agent, which is the exact confusion this screen exists to remove — the
 * builtin is answered by {@link isBuiltinAgentUsable} instead.
 */
export const collectRunnableCliHarnessTypes = (
  connectedTypes: ReadonlySet<string>,
): ReadonlySet<string> => {
  const runnable = new Set<string>();

  for (const type of connectedTypes) {
    if (isBuiltinEngineType(type)) continue;
    runnable.add(type);
  }

  return runnable;
};

/** Whether Prime has a credential-backed inference route. */
export const isBuiltinAgentUsable = (bindings: readonly ProviderBinding[]): boolean =>
  collectPrimeModelRoutes(
    bindings.filter(
      (binding) =>
        binding.model !== PROVIDER_CONFIG_ANCHOR_MODEL &&
        /^credential:cred_[\w-]+$/.test(binding.secretReference),
    ),
  ).length > 0;

export interface AgentAvailability {
  /** A provider route exists for creating a builtin agent. */
  builtinUsable: boolean;
  /** Connected CLI harnesses, each one a runnable agent today. */
  runnableCliTypes: ReadonlySet<string>;
  /** A configured profile exists for continuing account setup. */
  usable: boolean;
}

export const resolveAgentAvailability = ({
  bindings,
  connectedTypes,
}: {
  bindings: readonly ProviderBinding[];
  connectedTypes: ReadonlySet<string>;
}): AgentAvailability => {
  const runnableCliTypes = collectRunnableCliHarnessTypes(connectedTypes);
  const builtinUsable = isBuiltinAgentUsable(bindings);

  return {
    builtinUsable,
    runnableCliTypes,
    usable: (builtinUsable && connectedTypes.has('orvilo')) || runnableCliTypes.size > 0,
  };
};

/**
 * What the machine-side probe found, for the screen's own "installed on this
 * device" list and for choosing between its populated and empty layouts.
 */
export const collectInstalledHarnessTypes = (
  agents: HeterogeneousAgentScanMap | null | undefined,
): ReadonlySet<string> => {
  const installed = new Set<string>();
  if (!agents) return installed;

  for (const [type, status] of Object.entries(agents)) {
    if (status?.available === true) installed.add(type);
  }

  return installed;
};
