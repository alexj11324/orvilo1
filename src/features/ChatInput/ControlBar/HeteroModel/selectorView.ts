import type {
  HeterogeneousProviderConfig,
  HeterogeneousReasoningEffort,
  HeterogeneousTopicPin,
  HeteroSelection,
  HeteroSelectorCapability,
} from '@orvilo/types';
import { getHeteroSelectorCapability, HETEROGENEOUS_AGENT_DEFAULT_SELECTION } from '@orvilo/types';

import { isBuiltinEngineType } from '@/features/HeterogeneousAgent/engine';

export type ModelCapability = Required<Pick<HeteroSelectorCapability, 'model'>> &
  HeteroSelectorCapability;

/**
 * Whether the composer can offer a model picker at all. `model` is the anchor
 * dimension: `amp` (mode-only) and `kimi-code` (empty capability) have no model
 * to switch, so they get the read-only chip instead of a fabricated list.
 */
export const hasConversationModelSelector = (type: string | undefined): boolean => {
  // Builtin Orvilo (Prime) is absent from the ACP capability table on purpose —
  // it has no CLI selector to read — but it very much HAS a model dimension: the
  // provider-binding routes `useComposerModelSource` builds for it. The spec puts
  // it in the same bucket as the CLI harnesses — §5.1 第 1 档「内置 Orvilo
  // （Prime）」, and `ActionBar/Model` must dispatch 「有模型能力（Prime / CLI
  // harness）→ ModelSwitchPanel + simpleSource」 (docs/development/
  // chat-agent-model-ia.md §5.1 第 1-3 档). Gating on the capability table alone
  // marked Prime "no model dimension", so the composer rendered the inert
  // "cannot switch models" chip and that list could never be opened.
  if (isBuiltinEngineType(type)) return true;

  return !!getHeteroSelectorCapability(type)?.model;
};

/**
 * Whether the composer can offer an effort picker. Model-only harnesses
 * (`cursor` / `droid` / `devin` / `opencode` / `pi` / `trae`) have no effort
 * dimension, so they render no chip at all — a missing dimension, not a broken
 * control.
 */
export const hasConversationEffortSelector = (type: string | undefined): boolean =>
  !!getHeteroSelectorCapability(type)?.effort;

/**
 * A dimension the newly picked model cannot serve would otherwise stay persisted
 * and be silently dropped by the CLI, leaving the selector claiming a setting the
 * run never used.
 */
export const resolveModelSwitchSelection = ({
  capability,
  effort,
  isFastSpeed,
  value,
}: {
  capability: ModelCapability;
  effort?: HeterogeneousReasoningEffort;
  isFastSpeed: boolean;
  value: string;
}): HeteroSelection => {
  const resetSpeed = isFastSpeed && !!capability.speed && !capability.speed.supported(value);
  const resetEffort =
    !!effort &&
    effort !== HETEROGENEOUS_AGENT_DEFAULT_SELECTION &&
    !!capability.effort &&
    !capability.effort.levels(value).includes(effort);

  return {
    ...(resetEffort ? { effort: HETEROGENEOUS_AGENT_DEFAULT_SELECTION } : {}),
    model: value,
    ...(resetSpeed ? { speed: HETEROGENEOUS_AGENT_DEFAULT_SELECTION } : {}),
  };
};

/**
 * The reasoning effort this conversation has in effect — the composer's own pick
 * first, then the active topic's pin, then the agent config.
 *
 * A blank composer holds its pick in chat state rather than on a topic (spec
 * §5.2), so a reader that stops at "topic pin, else agent" cannot see it. That
 * is what froze the effort chip on the agent's level after a selection, and what
 * made a model switch skip the effort reset it owed (`resolveComposerEffortReset`).
 */
export const resolveComposerCurrentEffort = ({
  composerEffort,
  provider,
  topicPin,
}: {
  composerEffort?: HeterogeneousReasoningEffort;
  provider?: HeterogeneousProviderConfig;
  topicPin?: HeterogeneousTopicPin;
}): HeterogeneousReasoningEffort | undefined =>
  composerEffort ?? topicPin?.effort ?? provider?.effort;

/**
 * The effort that must ride along with a model switch made in the composer: a
 * model that cannot serve the effort in effect must not leave it pinned (spec
 * §5.2). `undefined` means the switch keeps whatever is in effect.
 */
export const resolveComposerEffortReset = ({
  composerEffort,
  provider,
  topicPin,
  value,
}: {
  composerEffort?: HeterogeneousReasoningEffort;
  provider?: HeterogeneousProviderConfig;
  topicPin?: HeterogeneousTopicPin;
  /** The model being selected. */
  value: string;
}): HeterogeneousReasoningEffort | undefined => {
  const capability = getHeteroSelectorCapability(provider?.type);
  if (!capability?.model || !capability.effort) return undefined;

  return resolveModelSwitchSelection({
    capability: { ...capability, model: capability.model },
    effort: resolveComposerCurrentEffort({ composerEffort, provider, topicPin }),
    // The composer never sets Codex's fast tier, so there is no speed to reset
    // (spec §4.1).
    isFastSpeed: false,
    value,
  }).effort;
};
