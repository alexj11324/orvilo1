import { isHeterogeneousAgentModelId } from '@orvilo/const';
import type { HeterogeneousAgentType } from '@orvilo/heterogeneous-agents';
import { canMountBuiltinToolSurface } from '@orvilo/heterogeneous-agents';
import { DEFAULT_ORVILO_ENGINE, type OrviloAgentAgencyConfig } from '@orvilo/types';

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
  if (explicit)
    return { heteroType: explicit.type, heterogeneousProvider: explicit, synthesized: false };
  if (isHeterogeneousAgentModelId(model))
    return { heteroType: model, heterogeneousProvider: undefined, synthesized: false };
  return {
    heteroType: 'orvilo',
    heterogeneousProvider: { engine: DEFAULT_ORVILO_ENGINE, type: 'orvilo' },
    synthesized: true,
  };
};

/**
 * Whether the agent's resolved execution binding can mount the per-run
 * builtin/MCP tool surface — the pre-dispatch form of the
 * `supportsBuiltinToolMount` input `resolveRunToolSurface` gets from the
 * execution turn. Selection and binding gates call this so a task that
 * requires the surface is never routed onto an agent that cannot mount it.
 */
export const agentCanMountBuiltinToolSurface = (
  agentConfig:
    | { agencyConfig?: OrviloAgentAgencyConfig | null }
    | Pick<AgentConfigWithId, 'agencyConfig'>
    | null
    | undefined,
  model?: string | null,
): boolean => {
  const { heteroType, heterogeneousProvider } = resolveExecutionBinding(
    agentConfig?.agencyConfig ? { agencyConfig: agentConfig.agencyConfig } : {},
    model,
  );
  return canMountBuiltinToolSurface({
    engine: heterogeneousProvider?.engine,
    type: heteroType,
  });
};
