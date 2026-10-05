import type {
  HeterogeneousAgentScanMap,
  HeterogeneousAgentType,
} from '@orvilo/heterogeneous-agents';
import type { HeterogeneousReasoningEffort, HeteroSelectorCapability } from '@orvilo/types';
import { getHeteroSelectorCapability, HETEROGENEOUS_AGENT_DEFAULT_SELECTION } from '@orvilo/types';

import { modelDisplayLabel } from '@/features/ChatInput/ControlBar/HeteroModel/modelOptions';
import { CONNECTABLE_PROVIDERS, type ConnectableProvider } from '@/features/ConnectAgent/providers';

export { modelDisplayLabel };

/**
 * The create page's built-in choice. `'orvilo'` is not a connectable provider —
 * it is the product's own agent — so the option lists keep it out of
 * `CONNECTABLE_PROVIDERS` and the page keys the selection on this sentinel.
 */
export const BUILTIN_AGENT_KEY = 'orvilo';

export type AgentChoice = typeof BUILTIN_AGENT_KEY | HeterogeneousAgentType;

/**
 * Harnesses the machine actually has — the only rows a create page may offer.
 * Not-installed providers never appear: a create surface offers what can
 * really run, not an inventory of what could be downloaded elsewhere.
 */
export const installedProviders = (
  agents: HeterogeneousAgentScanMap | null | undefined,
): ConnectableProvider[] =>
  CONNECTABLE_PROVIDERS.filter((provider) => agents?.[provider.type]?.available === true);

export const selectorCapabilityFor = (type: string | undefined): HeteroSelectorCapability =>
  getHeteroSelectorCapability(type) ?? {};

export const hasModelStep = (type: string | undefined): boolean =>
  !!selectorCapabilityFor(type).model;

export const hasEffortStep = (type: string | undefined): boolean =>
  !!selectorCapabilityFor(type).effort;

/**
 * Effort choices for a harness+model pair, `Default` first: omitted effort
 * leaves the CLI's own setting in control (agencyConfig doc), so it is always
 * a valid selection. Levels the harness does not declare are never shown.
 */
export const effortOptionsFor = (
  type: string | undefined,
  model: string,
): readonly HeterogeneousReasoningEffort[] => {
  const effort = selectorCapabilityFor(type).effort;
  if (!effort) return [];
  return [HETEROGENEOUS_AGENT_DEFAULT_SELECTION, ...effort.levels(model)];
};

/** A model switch cannot carry an effort level its new model rejects. */
export const validEffortFor = (
  type: string | undefined,
  model: string,
  effort: HeterogeneousReasoningEffort,
): HeterogeneousReasoningEffort =>
  effortOptionsFor(type, model).includes(effort) ? effort : HETEROGENEOUS_AGENT_DEFAULT_SELECTION;
