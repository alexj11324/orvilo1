import { isBuiltinHeterogeneousType } from '@orvilo/heterogeneous-agents';
import type {
  BuiltinHeterogeneousAgentType,
  HeterogeneousAgentType,
  HeterogeneousProviderConfig,
  HeteroSelection,
  HeteroSelectionPatch,
  HeteroSelectorCapability,
  OrviloEngineKind,
} from '@orvilo/types';
import {
  applyHeteroSelection,
  DEFAULT_ORVILO_ENGINE,
  getHeteroSelectorCapability,
  HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
  ORVILO_ENGINE_KINDS,
  resolveHeteroCliAgentType,
  resolveOrviloCliAgentType,
  resolveOrviloEngine,
} from '@orvilo/types';
import type { PartialDeep } from 'type-fest';

export const ORVILO_HETEROGENEOUS_TYPE = 'orvilo' satisfies BuiltinHeterogeneousAgentType;

// Canonical engine helpers live in @orvilo/types so the CLI, server, and
// desktop main share them — re-export under the feature's existing names.
export { DEFAULT_ORVILO_ENGINE, ORVILO_ENGINE_KINDS, resolveOrviloEngine };

export const isBuiltinEngineType = (
  type: string | undefined,
): type is BuiltinHeterogeneousAgentType => !!type && isBuiltinHeterogeneousType(type);

/**
 * Local CLI family an Orvilo engine borrows: the spawned binary, the selector
 * capability table, and the model/effort catalogs all resolve against it.
 */
export const resolveOrviloEngineCliType = (
  engine?: OrviloEngineKind | null,
): 'claude-code' | 'codex' => resolveOrviloCliAgentType(engine);

/**
 * The provider type used for selector-capability resolution. The builtin
 * Orvilo harness has no entry of its own in `HETERO_SELECTOR_CAPABILITIES` —
 * its model/effort dimensions follow the selected engine's CLI family.
 */
export const resolveEngineSelectorType = (
  provider?: Pick<HeterogeneousProviderConfig, 'engine' | 'type'> | null,
): string | undefined => resolveHeteroCliAgentType(provider);

export const getEngineSelectorCapability = (
  provider?: Pick<HeterogeneousProviderConfig, 'engine' | 'type'> | null,
): HeteroSelectorCapability | undefined =>
  getHeteroSelectorCapability(resolveEngineSelectorType(provider));

/**
 * `applyHeteroSelection` resolves arg-clearing encodings from `provider.type`,
 * which has no entry for `orvilo`. Route builtin providers through their
 * engine's CLI family so a model/effort pick still strips contradicting flags.
 */
export const applyEngineAwareSelection = (
  provider: HeterogeneousProviderConfig | null | undefined,
  selection: HeteroSelection,
): HeteroSelectionPatch => {
  const selectorType = resolveEngineSelectorType(provider);
  if (!provider || !selectorType || selectorType === provider.type) {
    return applyHeteroSelection(provider, selection);
  }
  return applyHeteroSelection({ ...provider, type: selectorType }, selection);
};

/**
 * `heterogeneousProvider` fields whose meaning is scoped to one harness — a
 * `model`/`effort`/`command` picked for Claude Code is not a Codex value, so a
 * harness switch must clear them rather than let the deep merge carry them
 * over.
 */
const CLEARABLE_PROVIDER_FIELDS = [
  'args',
  'command',
  'effort',
  'engine',
  'env',
  'mode',
  'model',
  'platformAgentId',
  'speed',
] as const satisfies readonly (keyof HeterogeneousProviderConfig)[];

type ClearableProviderField = (typeof CLEARABLE_PROVIDER_FIELDS)[number];

const ENGINE_SWITCH_CLEARABLE_FIELDS = [
  'command',
  'env',
  'mode',
  'platformAgentId',
] as const satisfies readonly ClearableProviderField[];

/**
 * `null` is the persisted clear marker for provider fields. Keep it explicit
 * in the patch type instead of widening the provider config or using `any`.
 */
type ClearableHeterogeneousProviderPatch = Omit<
  PartialDeep<HeterogeneousProviderConfig>,
  ClearableProviderField
> & {
  [K in ClearableProviderField]?: HeterogeneousProviderConfig[K] | null;
};

const toHeterogeneousProviderPatch = (
  patch: ClearableHeterogeneousProviderPatch,
): PartialDeep<HeterogeneousProviderConfig> =>
  // The persistence patch API is typed as PartialDeep, while null is its
  // runtime clear marker. This is the single boundary between those shapes.
  patch as PartialDeep<HeterogeneousProviderConfig>;

const clearProviderField = <K extends ClearableProviderField>(
  patch: ClearableHeterogeneousProviderPatch,
  current: HeterogeneousProviderConfig,
  field: K,
): void => {
  if (Object.hasOwn(current, field)) patch[field] = null;
};

/**
 * Patch written when the user switches harness in the Engine section.
 *
 * `updateAgentConfig` deep-merges `heterogeneousProvider` over the stored row,
 * so fields the new harness does not share have to be nulled out explicitly —
 * `undefined` is skipped by the merge and would silently keep a stale
 * `model`/`command` from the previous harness. `systemContext`
 * is harness-agnostic and survives the switch.
 */
export const buildHarnessProviderPatch = (
  current: HeterogeneousProviderConfig | null | undefined,
  nextType: HeterogeneousAgentType,
): PartialDeep<HeterogeneousProviderConfig> => {
  const patch: ClearableHeterogeneousProviderPatch = { type: nextType };

  if (current) {
    for (const field of CLEARABLE_PROVIDER_FIELDS) {
      clearProviderField(patch, current, field);
    }
  }

  if (isBuiltinEngineType(nextType)) {
    patch.engine = DEFAULT_ORVILO_ENGINE;
  }

  if (current?.systemContext) {
    patch.systemContext = current.systemContext;
  }

  return toHeterogeneousProviderPatch(patch);
};

/**
 * Patch written when the Orvilo harness's inner engine changes. Model aliases
 * and speed modes do not translate across engine families, so they reset to
 * the provider's "no override" default; the reasoning effort survives when the
 * new engine's capability still lists it for the default model.
 */
export const buildEngineProviderPatch = (
  current: HeterogeneousProviderConfig | null | undefined,
  nextEngine: OrviloEngineKind,
): PartialDeep<HeterogeneousProviderConfig> => {
  if (!current || !isBuiltinEngineType(current.type)) {
    return { engine: nextEngine, type: ORVILO_HETEROGENEOUS_TYPE };
  }

  if (current.engine === nextEngine) return { engine: nextEngine };

  const nextCapability = getHeteroSelectorCapability(resolveOrviloEngineCliType(nextEngine));
  const effort = current.effort;
  const keepEffort =
    !!effort &&
    effort !== HETEROGENEOUS_AGENT_DEFAULT_SELECTION &&
    !!nextCapability?.effort?.levels(HETEROGENEOUS_AGENT_DEFAULT_SELECTION).includes(effort);

  const patch: ClearableHeterogeneousProviderPatch = {
    // User-authored args spell flags for the old engine's CLI family; keep none.
    args: null,
    effort: keepEffort ? current.effort : HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
    engine: nextEngine,
    model: HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
    speed: HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
  };

  for (const field of ENGINE_SWITCH_CLEARABLE_FIELDS) {
    clearProviderField(patch, current, field);
  }

  if (current.systemContext !== undefined) {
    patch.systemContext = current.systemContext;
  }

  return toHeterogeneousProviderPatch(patch);
};
