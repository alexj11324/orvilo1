import { ChatErrorType } from '@orvilo/types';
import type OpenAI from 'openai';

import { createErrorResponse } from '@/utils/errorResponse';

import { createOpenai } from './createOpenai';

/**
 * Create an OpenAI client from deployment configuration only.
 *
 * Caller-supplied provider credentials (`X-openai-api-key` /
 * `X-openai-end-point` headers) are intentionally ignored — user BYOK is
 * retired and must never drive a server-side model call.
 */
export const createBizOpenAI = (): Response | OpenAI => {
  let openai: OpenAI;

  try {
    openai = createOpenai();
  } catch (error) {
    if ((error as Error).cause === ChatErrorType.NoOpenAIAPIKey) {
      return createErrorResponse(ChatErrorType.NoOpenAIAPIKey);
    }

    console.error(error); // log error to trace it
    return createErrorResponse(ChatErrorType.InternalServerError);
  }

  return openai;
};
