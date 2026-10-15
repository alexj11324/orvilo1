import { ClaudeCodeIdentifier } from '@orvilo/builtin-tool-claude-code';
import { OrviloAgentApiName, OrviloAgentIdentifier } from '@orvilo/builtin-tool-orvilo-agent';
import {
  UserInteractionApiName,
  UserInteractionIdentifier,
} from '@orvilo/builtin-tool-user-interaction';

const CURSOR_IDENTIFIER = 'cursor';
const DEVIN_IDENTIFIER = 'devin';
const DROID_IDENTIFIER = 'droid';
const QODER_IDENTIFIER = 'qoder';

interface SubmitToolInteractionOptions {
  createUserMessage?: boolean;
  pluginState?: Record<string, unknown>;
  toolResultContent?: string;
}

interface CustomInteractionSubmitResult {
  options?: SubmitToolInteractionOptions;
  payload: Record<string, unknown>;
}

interface CustomInteractionContext {
  apiName?: string;
  requestArgs?: Record<string, unknown>;
  topicId?: string | null;
}

type CustomInteractionSubmitHandler = (
  payload: Record<string, unknown>,
  context?: CustomInteractionContext,
) => Promise<CustomInteractionSubmitResult | undefined>;

const isOrviloAgentAskUserQuestion = (identifier: string, apiName?: string) =>
  identifier === OrviloAgentIdentifier && apiName === OrviloAgentApiName.askUserQuestion;

const isAskUserQuestionCall = (identifier: string, apiName?: string) =>
  (identifier === UserInteractionIdentifier &&
    apiName === UserInteractionApiName.askUserQuestion) ||
  isOrviloAgentAskUserQuestion(identifier, apiName);

const customInteractionSubmitHandlers: Array<{
  handler: CustomInteractionSubmitHandler;
  match: (identifier: string, apiName?: string) => boolean;
}> = [
  {
    // `createUserMessage: false` — the completed tool card already renders the
    // answers from `pluginState.askUserAnswers`, so the client runtime must
    // resume from the tool result instead of synthesizing a `role: 'user'`
    // message (which duplicated the answer as a user bubble). This also aligns
    // with the Gateway resume path, which never creates a user turn here.
    handler: async (payload) => ({
      options: { createUserMessage: false, pluginState: { askUserAnswers: payload } },
      payload,
    }),
    match: isAskUserQuestionCall,
  },
];

const findCustomInteractionSubmitHandler = (identifier: string, apiName?: string) =>
  customInteractionSubmitHandlers.find((entry) => entry.match(identifier, apiName))?.handler;

/**
 * Identifiers whose intervention component renders inline as a form (with
 * `onInteractionAction` callbacks) rather than the default approve / reject
 * approval UI. Hetero CLIs (CC AskUserQuestion etc.) need this surface
 * because the answer ships back through IPC, not through a synthetic user
 * turn.
 */
const HETERO_CUSTOM_INTERACTION_IDENTIFIERS = new Set<string>([
  ClaudeCodeIdentifier,
  CURSOR_IDENTIFIER,
  DEVIN_IDENTIFIER,
  DROID_IDENTIFIER,
  QODER_IDENTIFIER,
  // Standard-ACP providers — permission + elicitation requests surface the
  // same AskUserQuestion-style inline form (submitted through the AskUser
  // bridge rather than a synthetic user turn).
  'amp',
  'codebuddy',
  'grok-build',
  'trae',
  'codex',
  'kimi-code',
  'opencode',
  'pi',
]);

export const isHeteroInteractionIdentifier = (identifier: string) =>
  HETERO_CUSTOM_INTERACTION_IDENTIFIERS.has(identifier);

/**
 * orvilo-agent reuses the user-interaction `askUserQuestion` card. Unlike the
 * standalone tool (whose whole identifier is a custom interaction), orvilo-agent
 * has other APIs (createPlan / clearTodos …) that must keep the default
 * approve/reject UI — so only its `askUserQuestion` API is a custom interaction.
 */
export const isCustomInteractionIdentifier = (identifier: string, apiName?: string) =>
  identifier === UserInteractionIdentifier ||
  isOrviloAgentAskUserQuestion(identifier, apiName) ||
  isHeteroInteractionIdentifier(identifier) ||
  Boolean(findCustomInteractionSubmitHandler(identifier, apiName));

export const prepareCustomInteractionSubmit = async (
  identifier: string,
  payload: Record<string, unknown>,
  context?: CustomInteractionContext,
): Promise<CustomInteractionSubmitResult> => {
  const handler = findCustomInteractionSubmitHandler(identifier, context?.apiName);
  const result = await handler?.(payload, context);

  return result ?? { payload };
};
