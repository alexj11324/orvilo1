import type { ErrorType } from '@orvilo/types';
import type OpenAI from 'openai';

import type { ChatStreamPayload } from './chat';
import type { IOrviloAgentRuntimeErrorType } from './error';

export interface AgentInitErrorPayload {
  error: object;
  errorType: string | number;
}

export interface ChatCompletionErrorPayload {
  [key: string]: any;
  endpoint?: string;
  error: object;
  errorType: ErrorType | IOrviloAgentRuntimeErrorType;
  message?: string;
  provider: string;
}

export interface CreateChatCompletionOptions {
  chatModel: OpenAI;
  payload: ChatStreamPayload;
}

// canonical definition lives next to the ModelProvider enum in model-bank
export type { ModelProviderKey } from 'model-bank';
