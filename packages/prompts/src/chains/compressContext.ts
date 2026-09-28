import type { OpenAIChatMessage, UIChatMessage } from '@orvilo/types';

import {
  chatHistoryPrompts,
  compressContextSystemPrompt,
  compressContextUserPrompt,
} from '../prompts';

export const COMPRESS_CONTEXT_PROMPT_VERSION = 'v1';

export const COMPRESS_CONTEXT_JSON_SCHEMA = {
  name: 'compress_context',
  schema: {
    additionalProperties: false,
    properties: {
      summary: {
        description: 'The structured conversation summary following the specified section format',
        type: 'string',
      },
    },
    required: ['summary'],
    type: 'object' as const,
  },
  strict: true,
};

/**
 * Chain for compressing conversation context into a summary
 * Used when conversation history exceeds token threshold
 */
export const chainCompressContext = (
  messages: UIChatMessage[],
  existingSummary?: string,
): { messages: OpenAIChatMessage[] } => ({
  messages: [
    {
      content: compressContextSystemPrompt,
      role: 'system',
    },
    {
      content: `${existingSummary ? `Existing conversation summary:\n${existingSummary}\n\nNew conversation history:\n` : ''}${chatHistoryPrompts(messages)}

${compressContextUserPrompt}
Return one JSON object with a single "summary" string matching the supplied schema.`,
      role: 'user',
    },
  ],
});
