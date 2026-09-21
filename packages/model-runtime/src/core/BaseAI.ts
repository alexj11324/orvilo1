import type { AIBaseModelCard } from 'model-bank';
import type OpenAI from 'openai';

import type {
  ASROptions,
  ASRPayload,
  ASRResponse,
  ChatMethodOptions,
  ChatStreamPayload,
  Embeddings,
  EmbeddingsOptions,
  EmbeddingsPayload,
  GenerateObjectOptions,
  GenerateObjectPayload,
  ModelRequestOptions,
  PullModelParams,
  TextToSpeechOptions,
  TextToSpeechPayload,
} from '../types';

export interface OrviloRuntimeAI {
  baseURL?: string;
  chat?: (payload: ChatStreamPayload, options?: ChatMethodOptions) => Promise<Response>;
  embeddings?: (payload: EmbeddingsPayload, options?: EmbeddingsOptions) => Promise<Embeddings[]>;

  generateObject?: (
    payload: GenerateObjectPayload,
    options?: GenerateObjectOptions,
  ) => Promise<any>;

  models?: () => Promise<any>;

  // Model management related interface
  pullModel?: (params: PullModelParams, options?: ModelRequestOptions) => Promise<Response>;

  textToSpeech?: (
    payload: TextToSpeechPayload,
    options?: TextToSpeechOptions,
  ) => Promise<ArrayBuffer>;

  transcribe?: (payload: ASRPayload, options?: ASROptions) => Promise<ASRResponse>;
}
/* eslint-enabled */

export abstract class OrviloOpenAICompatibleRuntime {
  abstract baseURL: string;
  abstract client: OpenAI;

  abstract chat(payload: ChatStreamPayload, options?: ChatMethodOptions): Promise<Response>;
  abstract generateObject(
    payload: GenerateObjectPayload,
    options?: GenerateObjectOptions,
  ): Promise<Record<string, any>>;

  abstract models(): Promise<AIBaseModelCard[]>;

  abstract embeddings(
    payload: EmbeddingsPayload,
    options?: EmbeddingsOptions,
  ): Promise<Embeddings[]>;

  transcribe?(payload: ASRPayload, options?: ASROptions): Promise<ASRResponse>;

  textToSpeech?(payload: TextToSpeechPayload, options?: TextToSpeechOptions): Promise<ArrayBuffer>;
}
