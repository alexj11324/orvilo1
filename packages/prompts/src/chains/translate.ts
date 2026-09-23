import type { OpenAIChatMessage } from '@orvilo/types';

export const TRANSLATE_PROMPT_VERSION = 'v1';

export const TRANSLATE_JSON_SCHEMA = {
  name: 'translation',
  schema: {
    additionalProperties: false,
    properties: {
      translation: { description: 'The translated text', type: 'string' },
    },
    required: ['translation'],
    type: 'object' as const,
  },
  strict: true,
};

export const chainTranslate = (
  content: string,
  targetLang: string,
): { messages: OpenAIChatMessage[] } => ({
  messages: [
    {
      content: `You are a professional translator. Translate the input text to ${targetLang}.

Rules:
- Return one JSON object with a single "translation" string matching the supplied schema
- No explanations or additional fields
- Preserve technical terms, code identifiers, API keys, and proper nouns exactly as they appear
- Maintain the original formatting and structure
- Use natural, idiomatic expressions in the target language`,
      role: 'system',
    },
    {
      content,
      role: 'user',
    },
  ],
});
