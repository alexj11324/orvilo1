import type { OpenAIChatMessage, UIChatMessage } from '@orvilo/types';

import { chatHistoryPrompts } from '../prompts';

export const SUMMARY_HISTORY_PROMPT_VERSION = 'v1';

export const SUMMARY_HISTORY_JSON_SCHEMA = {
  name: 'summary_history',
  schema: {
    additionalProperties: false,
    properties: {
      summary: { description: 'The conversation history summary', type: 'string' },
    },
    required: ['summary'],
    type: 'object' as const,
  },
  strict: true,
};

export const chainSummaryHistory = (
  messages: UIChatMessage[],
): { messages: OpenAIChatMessage[] } => ({
  messages: [
    {
      content: `You're an assistant who's good at extracting key takeaways from conversations and summarizing them. Please summarize according to the user's needs. The content you need to summarize is located in the <chat_history> </chat_history> group of xml tags. The summary needs to maintain the original language. Return one JSON object with a single "summary" string matching the supplied schema.`,
      role: 'system',
    },
    {
      content: `${chatHistoryPrompts(messages)}

Please summarize the above conversation and retain key information. The summarized content will be used as context for subsequent prompts, and should be limited to 400 tokens.`,

      role: 'user',
    },
  ],
});
