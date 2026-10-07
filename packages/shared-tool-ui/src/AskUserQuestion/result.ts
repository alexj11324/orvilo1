import { isRecord } from '@orvilo/utils/object';
import { safeParseJSON } from '@orvilo/utils/safeParseJSON';

export interface AskUserQuestionResultState {
  askUserAnswers?: Record<string, string | string[]>;
  heterogeneousIntervention?: { resolutionRequestId?: string; transition?: string };
}

const USER_SUBMITTED_PREFIX = 'User submitted:';

const normalizeAnswers = (value: unknown): Record<string, string | string[]> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string | string[]] =>
      typeof entry[1] === 'string' ||
      (Array.isArray(entry[1]) && entry[1].every((item) => typeof item === 'string')),
  );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

/**
 * Resolve the structured answers for a completed AskUserQuestion call.
 *
 * New messages persist `pluginState.askUserAnswers`. Older builtin calls only
 * stored `User submitted: {...}` in the tool result, so keep that lightweight
 * compatibility path instead of exposing the generic JSON result renderer.
 */
export const resolveAskUserAnswers = (
  pluginState: AskUserQuestionResultState | undefined,
  content: unknown,
): Record<string, string | string[]> | undefined => {
  const native = pluginState?.heterogeneousIntervention;
  if (native && (native.transition !== 'resolved' || !native.resolutionRequestId)) return;
  const result = typeof content === 'string' ? safeParseJSON(content) : content;
  if (isRecord(result) && result.cancelled === true) return;

  const persisted = normalizeAnswers(pluginState?.askUserAnswers);
  if (persisted) return persisted;

  if (isRecord(result)) return normalizeAnswers(result.result);
  if (typeof content !== 'string') return;

  const prefixIndex = content.indexOf(USER_SUBMITTED_PREFIX);
  if (prefixIndex < 0) return;

  try {
    return normalizeAnswers(JSON.parse(content.slice(prefixIndex + USER_SUBMITTED_PREFIX.length)));
  } catch {
    return;
  }
};
