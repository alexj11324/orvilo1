import { isBuiltinHeterogeneousType } from '@orvilo/heterogeneous-agents';
import type {
  BuiltinHeterogeneousAgentType,
  HeterogeneousAgentType,
  HeterogeneousProviderConfig,
} from '@orvilo/types';
import type { PartialDeep } from 'type-fest';

export const ORVILO_HETEROGENEOUS_TYPE = 'orvilo' satisfies BuiltinHeterogeneousAgentType;

/**
 * The builtin Orvilo agent is bound to the embedded Prime harness — fixed,
 * never a selectable engine. There is no engine→CLI-family indirection left
 * to resolve: the only helpers this module still owns are the builtin-type
 * predicate and the harness-switch patch builder.
 */
export const isBuiltinEngineType = (
  type: string | undefined,
): type is BuiltinHeterogeneousAgentType => !!type && isBuiltinHeterogeneousType(type);

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
  'env',
  'mode',
  'model',
  'platformAgentId',
  'speed',
] as const satisfies readonly (keyof HeterogeneousProviderConfig)[];

type ClearableProviderField = (typeof CLEARABLE_PROVIDER_FIELDS)[number];

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

  if (current?.systemContext) {
    patch.systemContext = current.systemContext;
  }

  return toHeterogeneousProviderPatch(patch);
};
