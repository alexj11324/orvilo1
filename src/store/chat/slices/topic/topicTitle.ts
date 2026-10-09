import type { TopicTitleOrigin } from '@orvilo/types';

import { markdownToTxt } from '@/utils/markdownToTxt';

export interface TopicTitleAgent {
  /** Driven by an external CLI/ACP runtime (`agencyConfig.heterogeneousProvider`). */
  heterogeneous?: boolean;
  model?: string | null;
  provider?: string | null;
}

/**
 * The built-in agent also carries a runtime provider, with type `orvilo`.
 * Fails closed: a provider that is present but is not positively `orvilo`
 * (another type, or no type at all) is external, so its conversation is never
 * sent to an Orvilo cloud model. Only a missing provider (legacy built-in
 * agent) or `orvilo` counts as built-in.
 */
export const isExternalAgentRuntime = (
  runtimeProvider?: { type?: string | null } | null,
): boolean => !!runtimeProvider && runtimeProvider.type !== 'orvilo';

export interface TopicTitleModel {
  model: string;
  provider: string;
}

/**
 * Which model names a topic: the one owned by the conversation's agent.
 * Only a built-in Orvilo agent with its own model/provider can name a topic
 * through Orvilo's cloud; heterogeneous agents (own auth/model) and unknown or
 * model-less agents return `undefined`, so callers derive the title locally.
 */
export const resolveTopicTitleModel = (
  agent: TopicTitleAgent | undefined,
): TopicTitleModel | undefined => {
  if (!agent || agent.heterogeneous) return undefined;
  if (!agent.model || !agent.provider) return undefined;
  return { model: agent.model, provider: agent.provider };
};

export type TopicTitleSource =
  { kind: 'agent'; title: string } | ({ kind: 'model' } & TopicTitleModel) | { kind: 'slice' };

/**
 * Who names a topic, in priority order: a title the agent itself reported
 * (ACP `session_info_update.title`, once the runtime forwards it) first, then
 * the owning built-in agent's model, otherwise the deterministic slice.
 * A heterogeneous agent never reaches the model branch.
 */
export const resolveTopicTitleSource = (
  agent: TopicTitleAgent | undefined,
  agentProvidedTitle?: string | null,
): TopicTitleSource => {
  const provided = agentProvidedTitle?.trim();
  if (provided) return { kind: 'agent', title: provided };

  const model = resolveTopicTitleModel(agent);
  return model ? { kind: 'model', ...model } : { kind: 'slice' };
};

/**
 * Whether an agent-reported title may replace the topic's current title.
 *
 * Order of authority: user > agent > auto (model / first-message slice).
 * `origin` is the recorded source (the in-memory last write, else the persisted
 * `metadata.titleSource`). Without one (topics titled before it existed) a title is only replaceable
 * if it is clearly Orvilo's own placeholder: empty, one of the placeholder /
 * default titles, or the slice of the first user message. Anything else is
 * assumed to be user-set (a heuristic for legacy topics).
 */
export const canAgentRetitleTopic = ({
  currentTitle,
  origin,
  placeholderTitles,
  sliceTitle,
}: {
  currentTitle?: string | null;
  origin?: TopicTitleOrigin;
  placeholderTitles: readonly string[];
  sliceTitle?: string;
}): boolean => {
  if (origin) return origin !== 'user';

  const current = currentTitle?.trim();
  if (!current) return true;
  return placeholderTitles.includes(current) || current === sliceTitle;
};

const TOPIC_TITLE_SLICE_LENGTH = 80;
const FALLBACK_TOPIC_TITLE = 'New Topic';

/** Deterministic title: the first user message, flattened to plain text. */
export const sliceTopicTitle = (messages: { content?: string | null; role: string }[]): string => {
  const firstUserText = messages.find((m) => m.role === 'user')?.content?.trim() ?? '';
  return markdownToTxt(firstUserText).slice(0, TOPIC_TITLE_SLICE_LENGTH) || FALLBACK_TOPIC_TITLE;
};
