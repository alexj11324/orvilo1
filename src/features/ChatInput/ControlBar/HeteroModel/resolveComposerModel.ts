import type { HeterogeneousProviderConfig, HeterogeneousTopicPin } from '@orvilo/types';
import {
  HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
  resolveHeterogeneousProviderTopicModel,
} from '@orvilo/types';

/**
 * The one i18n key that names the `default` sentinel. The picker row
 * (`useComposerModelSource`) and the chip (`ActionBar/Model`) both read it, so
 * one state cannot end up with two names.
 */
export const COMPOSER_DEFAULT_MODEL_LABEL_KEY = 'heteroAgent.modelSelector.default';

export interface ComposerModelOption {
  /** The harness's own label, as the picker renders it. */
  title: string;
  /** The selector value the harness accepts. */
  value: string;
}

/**
 * Put the harness `default` back at the top of a CLI list.
 *
 * Not a new capability — the picker this replaced had it, and the copy it left
 * behind (`heteroAgent.cliModel.defaultDesc`, "Use the default model configured
 * in {{name}}") says exactly what it means. `<harness> --model` unset is a real,
 * selectable state (`getExplicitClaudeCodeModel` drops the flag for the
 * sentinel), so without this row a conversation that picked a model could never
 * go back to "let the CLI decide" — the only way out was a new conversation.
 *
 * `title` is passed in rather than translated here so it is the SAME string the
 * chip renders for the sentinel ({@link COMPOSER_DEFAULT_MODEL_LABEL_KEY}), and
 * one state cannot end up with two names.
 */
export const withDefaultModelOption = <T extends ComposerModelOption>(
  options: readonly T[],
  title: string,
): ComposerModelOption[] => [
  { title, value: HETEROGENEOUS_AGENT_DEFAULT_SELECTION },
  ...options.map((option) => ({ title: option.title, value: option.value })),
];

export interface ComposerModelView {
  /** The selector value this conversation hands to the harness. */
  current: string;
  /**
   * Whether `current` is the harness `default` sentinel ("let the CLI resolve
   * its own model"). The caller renders its shared "Default" wording for it —
   * no model name may stand for a decision the CLI makes.
   */
  isDefault: boolean;
  /**
   * Chip text for `current`: the harness's own label for the value, or the raw
   * selector id when the list has no entry for it. Both live in the harness's
   * vocabulary — never another provider's model name.
   */
  title: string;
}

/**
 * The model line the composer chip shows for a heterogeneous (CLI / builtin
 * Orvilo) agent (docs/development/chat-agent-model-ia.md §5.3).
 *
 * The whole point is the VOCABULARY: a CLI agent's model is a selector value its
 * own harness accepts, and the picker must never name a model the harness cannot
 * run. The generic agent model — `getAgentModelById` falls back to the client's
 * `DEFAULT_MODEL` when the row configures none — is a model-bank LLM that means
 * nothing to a CLI, so it is deliberately not part of this chain.
 *
 * Precedence, all of it conversation-scoped (spec §5.2 — the agent row is never
 * read for the value, and never written):
 *
 * 1. the active topic's own pin;
 * 2. a pick waiting in the blank composer (`composerModelSelection`) — this is
 *    what makes the chip follow a selection made before the first message;
 * 3. the agent's configured selector model, resolved through the same
 *    `resolveHeterogeneousProviderTopicModel` the spawn and snapshot paths use;
 * 4. `default` — nothing chose a model, so the CLI resolves its own.
 *
 * A pin or pick minted for ANOTHER provider is ignored: it names a value this
 * harness would not accept, and showing it would put the chip back outside the
 * harness's vocabulary.
 *
 * Kept pure and out of the component on purpose (.agents/skills/testing/SKILL.md
 * #4 — no React component tests for new features).
 */
export const resolveComposerModelValue = ({
  composerSelection,
  provider,
  topicPin,
}: {
  /** `composerModelSelection` — the pick held for a conversation with no topic yet. */
  composerSelection?: { model: string; provider: string };
  provider: HeterogeneousProviderConfig;
  /** The active topic's heterogeneous pin (model / provider / effort). */
  topicPin?: HeterogeneousTopicPin;
}): string => {
  const { type } = provider;
  // A pin or pick minted for ANOTHER provider is ignored: it names a value this
  // harness would not accept.
  const pinnedModel = topicPin?.provider === type ? topicPin.model : undefined;
  const pickedModel = composerSelection?.provider === type ? composerSelection.model : undefined;
  // `resolveHeterogeneousProviderTopicModel` yields the `default` sentinel for a
  // harness that configures no model, and `undefined` only for a harness with no
  // model dimension at all (`kimi-code` / `amp`) — both land on the sentinel
  // below, which is the honest "nothing is chosen here".
  const agentModel = resolveHeterogeneousProviderTopicModel(provider)?.model;

  return pinnedModel ?? pickedModel ?? agentModel ?? HETEROGENEOUS_AGENT_DEFAULT_SELECTION;
};

export const resolveComposerModelView = ({
  composerSelection,
  options,
  provider,
  topicPin,
}: {
  composerSelection?: { model: string; provider: string };
  /** `simpleSource.options` — the harness's own list, empty while it loads or fails. */
  options: readonly ComposerModelOption[];
  provider: HeterogeneousProviderConfig;
  topicPin?: HeterogeneousTopicPin;
}): ComposerModelView => {
  const current = resolveComposerModelValue({ composerSelection, provider, topicPin });

  return {
    current,
    isDefault: current === HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
    title: options.find((option) => option.value === current)?.title ?? current,
  };
};
