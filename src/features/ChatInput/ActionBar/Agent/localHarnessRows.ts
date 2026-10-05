import type { HeterogeneousAgentScanMap } from '@orvilo/heterogeneous-agents';

import { CONNECTABLE_PROVIDERS, type ConnectableProvider } from '@/features/ConnectAgent/providers';

/**
 * One row in the composer picker's "installed on this device" section.
 * `available` mirrors the scan verdict; `reason` carries the detector's failure
 * text so the row can say why a harness is not usable instead of just greying out.
 */
export interface LocalHarnessRow {
  available: boolean;
  provider: ConnectableProvider;
  reason?: string;
  version?: string;
}

/**
 * Rows for the composer picker's local-harness section.
 *
 * Two rules shape the list:
 *
 * - Harnesses that already have an agent row are dropped. They are offered by
 *   the agent list above; re-offering them here would invite a duplicate agent
 *   for a runtime the user already connected.
 * - Available harnesses rank first, so the section opens on what the user can
 *   actually use today. The rest keep the provider-registry order behind the
 *   section's expander (`Array.prototype.sort` is stable).
 *
 * Kept out of the component so the filtering and ranking are unit-testable.
 */
export const buildLocalHarnessRows = (
  agents: HeterogeneousAgentScanMap | null | undefined,
  connectedTypes: ReadonlySet<string>,
): LocalHarnessRow[] => {
  if (!agents) return [];

  const rank = (available: boolean) => (available ? 0 : 1);

  return CONNECTABLE_PROVIDERS.filter((provider) => !connectedTypes.has(provider.type))
    .map((provider) => {
      const status = agents[provider.type];

      return {
        available: status?.available === true,
        provider,
        reason: status?.reason,
        version: status?.version,
      };
    })
    .sort((a, b) => rank(a.available) - rank(b.available));
};

/**
 * Harness types that already have an agent row, read off the sidebar payload's
 * `heterogeneousType` stamp. Cli and platform agents both carry it, so a
 * connected OpenClaw is filtered exactly like a connected Claude Code.
 */
export const collectConnectedHarnessTypes = (
  agents: ReadonlyArray<{ heterogeneousType?: null | string }>,
): Set<string> => {
  const connected = new Set<string>();
  for (const agent of agents) {
    if (agent.heterogeneousType) connected.add(agent.heterogeneousType);
  }

  return connected;
};
