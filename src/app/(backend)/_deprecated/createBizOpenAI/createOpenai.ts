import { ChatErrorType } from '@orvilo/types';
import OpenAI from 'openai';

import { getLLMConfig } from '@/envs/llm';

// create OpenAI instance from deployment-owned configuration
export const createOpenai = () => {
  const { OPENAI_API_KEY } = getLLMConfig();
  const OPENAI_PROXY_URL = process.env.OPENAI_PROXY_URL;

  const baseURL = OPENAI_PROXY_URL || undefined;

  const apiKey = OPENAI_API_KEY;

  if (!apiKey) throw new Error('OPENAI_API_KEY is empty', { cause: ChatErrorType.NoOpenAIAPIKey });

  return new OpenAI({ apiKey, baseURL });
};
