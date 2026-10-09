import { markdownToTxt } from '@/utils/markdownToTxt';

export interface TopicTitleAgent {
  /** Driven by an external CLI/ACP runtime (`agencyConfig.heterogeneousProvider`). */
  heterogeneous?: boolean;
  model?: string | null;
  provider?: string | null;
}

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

const TOPIC_TITLE_SLICE_LENGTH = 80;
const FALLBACK_TOPIC_TITLE = 'New Topic';

/** Deterministic title: the first user message, flattened to plain text. */
export const sliceTopicTitle = (messages: { content?: string | null; role: string }[]): string => {
  const firstUserText = messages.find((m) => m.role === 'user')?.content?.trim() ?? '';
  return markdownToTxt(firstUserText).slice(0, TOPIC_TITLE_SLICE_LENGTH) || FALLBACK_TOPIC_TITLE;
};
