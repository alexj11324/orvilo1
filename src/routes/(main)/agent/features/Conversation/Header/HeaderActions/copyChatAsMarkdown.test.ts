import type { UIChatMessage } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { buildChatMarkdownTranscript } from './copyChatAsMarkdown';

const msg = (partial: Partial<UIChatMessage>): UIChatMessage =>
  ({ content: '', id: 'm', role: 'assistant', ...partial }) as UIChatMessage;

describe('buildChatMarkdownTranscript', () => {
  it('joins user and assistant contents with a blank line', () => {
    const markdown = buildChatMarkdownTranscript([
      msg({ content: 'First question', role: 'user' }),
      msg({ content: 'First answer', role: 'assistant' }),
      msg({ content: 'Second question', role: 'user' }),
    ]);

    expect(markdown).toBe('First question\n\nFirst answer\n\nSecond question');
  });

  it('skips internal roles and empty contents', () => {
    const markdown = buildChatMarkdownTranscript([
      msg({ content: 'visible', role: 'user' }),
      msg({ content: '{"tool":true}', role: 'tool' }),
      msg({ content: '   ', role: 'assistant' }),
      msg({ content: 'system row', role: 'system' }),
      msg({ content: 'answer', role: 'assistant' }),
    ]);

    expect(markdown).toBe('visible\n\nanswer');
  });

  it('normalizes speaker tags and escaped markdown like per-message copy', () => {
    const markdown = buildChatMarkdownTranscript([
      msg({ content: '<speaker name="Agent" />\nline \\*one\\*', role: 'assistant' }),
    ]);

    expect(markdown).toBe('line *one*');
  });

  it('returns an empty string when there is nothing to copy', () => {
    expect(buildChatMarkdownTranscript([])).toBe('');
    expect(buildChatMarkdownTranscript([msg({ content: '', role: 'user' })])).toBe('');
  });
});
