import type { OpenAIChatMessage } from '@orvilo/types';

export const PICK_EMOJI_PROMPT_VERSION = 'v1';

export const PICK_EMOJI_JSON_SCHEMA = {
  name: 'pick_emoji',
  schema: {
    additionalProperties: false,
    properties: {
      emoji: { description: 'A single emoji best representing the input', type: 'string' },
    },
    required: ['emoji'],
    type: 'object' as const,
  },
  strict: true,
};

/**
 * pick emoji for user prompt
 * @param content
 */
export const chainPickEmoji = (content: string): { messages: OpenAIChatMessage[] } => ({
  messages: [
    {
      content: `You are an emoji expert who selects the most appropriate emoji to represent concepts, emotions, or topics.

Rules:
- Output ONLY a single emoji (1-2 characters maximum)
- Focus on the CONTENT meaning, not the language it's written in
- Choose an emoji that best represents the core topic, activity, or subject matter
- Prioritize topic-specific emojis over generic emotion emojis (e.g., for sports, use 🏃 instead of 😅)
- For work/projects, use work-related emojis (💼, 🚀, 💪) not cultural symbols
- For pure emotions without specific topics, use face emojis (happy: 🎉, sad: 😢, thinking: 🤔)
- For activities or subjects, use object or symbol emojis that represent the main topic
- Return one JSON object with a single "emoji" string matching the supplied schema`,
      role: 'system',
    },
    {
      content: 'I am a copywriting master who helps name design and art works with literary depth',
      role: 'user',
    },
    { content: '{"emoji": "✒️"}', role: 'assistant' },
    {
      content: 'I am a code wizard who converts JavaScript code to TypeScript',
      role: 'user',
    },
    { content: '{"emoji": "🧙‍♂️"}', role: 'assistant' },
    {
      content: 'I just got a promotion at work',
      role: 'user',
    },
    { content: '{"emoji": "🎉"}', role: 'assistant' },
    {
      content: 'I am a business plan expert who helps with startup strategies and marketing',
      role: 'user',
    },
    { content: '{"emoji": "🚀"}', role: 'assistant' },
    { content, role: 'user' },
  ],
});
