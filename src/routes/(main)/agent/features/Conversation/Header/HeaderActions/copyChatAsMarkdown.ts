import { type UIChatMessage } from '@orvilo/types';

import { cleanSpeakerTag } from '@/store/chat/utils/cleanSpeakerTag';
import { unescapeMarkdown } from '@/store/chat/utils/unescapeMarkdown';

/**
 * Serialize a topic's raw messages into a markdown transcript — the chat-level
 * form of the reference's `Copy as markdown` options-menu action.
 *
 * Only the human/agent narrative is kept: `user` and `assistant` rows with
 * non-empty content. Tool calls, system rows, and other internal roles are
 * skipped. Each message is normalized the same way per-message copy does
 * (speaker tags stripped, escaped punctuation unescaped) and sections are
 * joined by a blank line so existing markdown blocks stay intact.
 */
export const buildChatMarkdownTranscript = (messages: UIChatMessage[]): string =>
  messages
    .filter(
      (message) =>
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string' &&
        message.content.trim().length > 0,
    )
    .map((message) => unescapeMarkdown(cleanSpeakerTag(message.content.trim())))
    .join('\n\n');
