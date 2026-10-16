import { describe, expect, it } from 'vitest';

import { buildHeterogeneousPrompt, HeterogeneousPromptEngine } from './promptEngine';

describe('HeterogeneousPromptEngine', () => {
  it('orders system context, provider context, user prompt, and images', () => {
    expect(
      buildHeterogeneousPrompt({
        imageList: [{ id: 'image-1', url: 'https://example.com/image.png' }],
        prompt: '<refer_topic name="Previous" id="topic-ref" />\nSummarize it',
        systemContext: 'Workspace context',
      }),
    ).toEqual([
      { text: 'Workspace context', type: 'text' },
      {
        text: expect.stringContaining('`orvilo topic view <topic-id>`'),
        type: 'text',
      },
      {
        text: '<refer_topic name="Previous" id="topic-ref" />\nSummarize it',
        type: 'text',
      },
      {
        source: { id: 'image-1', type: 'url', url: 'https://example.com/image.png' },
        type: 'image',
      },
    ]);
  });

  describe('skill chips', () => {
    const promptText = (prompt: string) => {
      const blocks = buildHeterogeneousPrompt({ prompt });
      const last = blocks.at(-1);
      return last?.type === 'text' ? last.text : undefined;
    };

    it('turns a picked skill into the slash command the CLI invokes', () => {
      expect(
        promptText('<skill name="academic-paper" label="academic-paper" /> draft the intro'),
      ).toBe('/academic-paper draft the intro');
    });

    it('rewrites every chip and leaves the rest of the message alone', () => {
      expect(
        promptText('Use <skill name="a-b" label="A B" /> then <skill name="c:d" label="x" />.'),
      ).toBe('Use /a-b then /c:d.');
    });

    it('keeps agent-document skills and odd names as they are', () => {
      const documentSkill = '<skill name="agent-skills:notes.md" label="Notes" /> go';
      const oddName = '<skill name="rm -rf /" label="x" /> go';

      expect(promptText(documentSkill)).toBe(documentSkill);
      expect(promptText(oddName)).toBe(oddName);
    });
  });

  it('does not add topic guidance to unrelated prompts', () => {
    expect(new HeterogeneousPromptEngine({ prompt: 'Hello' }).process()).toEqual([
      { text: 'Hello', type: 'text' },
    ]);
  });

  it('recognizes markdown-escaped topic tags', () => {
    const blocks = buildHeterogeneousPrompt({
      prompt: '\\<refer\\_topic name="Previous" id="topic-ref" />',
    });

    expect(blocks[0]).toEqual({
      text: expect.stringContaining('`orvilo topic view <topic-id>`'),
      type: 'text',
    });
  });
});
