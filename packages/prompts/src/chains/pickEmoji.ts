import type { ChatStreamPayload } from '@orvilo/types';

/**
 * pick emoji for user prompt
 * @param content
 */
export const chainPickEmoji = (content: string): Partial<ChatStreamPayload> => ({
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
- No explanations or additional text`,
      role: 'system',
    },
    {
      content: 'I am a copywriting master who helps name design and art works with literary depth',
      role: 'user',
    },
    { content: '✒️', role: 'assistant' },
    {
      content: 'I am a code wizard who converts JavaScript code to TypeScript',
      role: 'user',
    },
    { content: '🧙‍♂️', role: 'assistant' },
    {
      content: 'I just got a promotion at work',
      role: 'user',
    },
    { content: '🎉', role: 'assistant' },
    {
      content: 'I am a business plan expert who helps with startup strategies and marketing',
      role: 'user',
    },
    { content: '🚀', role: 'assistant' },
    { content, role: 'user' },
  ],
});
