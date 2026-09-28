import type { AgentInitErrorPayload, ChatCompletionErrorPayload } from '../types';
import type { IOrviloAgentRuntimeErrorType } from '../types/error';

export const AgentRuntimeError = {
  chat: (error: ChatCompletionErrorPayload): ChatCompletionErrorPayload => error,
  createError: (
    errorType: IOrviloAgentRuntimeErrorType | string | number,
    error?: any,
  ): AgentInitErrorPayload => ({ error, errorType }),
};
