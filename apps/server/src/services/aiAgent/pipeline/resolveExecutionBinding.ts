import { isHeterogeneousAgentModelId } from '@orvilo/const';
import { DEFAULT_ORVILO_ENGINE } from '@orvilo/types';
import type { HeterogeneousAgentType } from '@orvilo/heterogeneous-agents';

import type { AgentConfigWithId } from '@/server/services/agent';

/**
 * Deployment-owned default execution binding: agents without an explicit
 * `heterogeneousProvider` run on the builtin Orvilo ACP harness.
 *
 * Since the Lobe model loop is retired, every agent run resolves to an ACP
 * execution binding — an explicit `agencyConfig.heterogeneousProvider` when
 * configured, a legacy heterogeneous `model` id (`'claude-code'`, `'codex'`,
 * …) when set, otherwise the builtin `'orvilo'` harness (default engine
 * `claude-sdk`, which the dispatch layer maps onto the claude-code ACP agent).
 * The binding is resolved per run; downstream device/sandbox dispatch in
 * `pipeline/heteroDispatch` validates the target environment, pins it to the
 * run, and rejects targets it cannot safely execute on.
 */
export const resolveExecutionBinding = (
  agentConfig: Pick<AgentConfigWithId, 'agencyConfig'>,
  model?: string | null,
): {
  /**
   * Effective provider config. `undefined` only for legacy hetero-by-model
   * agents, which keep raw CLI semantics (no persona injection).
   */
  heterogeneousProvider: NonNullable<AgentConfigWithId['agencyConfig']>['heterogeneousProvider'];
  heteroType: HeterogeneousAgentType;
  /**
   * Whether the provider was synthesized by the default binding (the caller
   * persists it onto the run-scoped `agentConfig` so every downstream
   * dispatch read observes the same binding).
   */
  synthesized: boolean;
} => {
  const explicit = agentConfig.agencyConfig?.heterogeneousProvider;
  if (explicit) return { heteroType: explicit.type, heterogeneousProvider: explicit, synthesized: false };
  if (isHeterogeneousAgentModelId(model))
    return { heteroType: model, heterogeneousProvider: undefined, synthesized: false };
  return {
    heteroType: 'orvilo',
    heterogeneousProvider: { engine: DEFAULT_ORVILO_ENGINE, type: 'orvilo' },
    synthesized: true,
  };
};
