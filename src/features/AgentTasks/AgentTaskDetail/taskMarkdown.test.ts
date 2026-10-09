import { describe, expect, it } from 'vitest';

import { escapeMarkdownText, markdownLink, taskMarkdownDocument } from './taskMarkdown';

const TASK_URL = 'https://example.com/ws/task/T-1/ship';

describe('escapeMarkdownText', () => {
  it('escapes backslashes and square brackets', () => {
    expect(escapeMarkdownText(String.raw`a\b [c] d`)).toBe(String.raw`a\\b \[c\] d`);
  });

  it('collapses line breaks into single spaces', () => {
    expect(escapeMarkdownText('one\r\n  two\n\nthree\n')).toBe('one two three');
  });
});

describe('markdownLink', () => {
  it('links a plain title', () => {
    expect(markdownLink('Ship the thing', TASK_URL)).toBe(`[Ship the thing](${TASK_URL})`);
  });

  it('keeps a hostile title inside the link label', () => {
    const link = markdownLink('x](javascript:alert(1)) [y', TASK_URL);

    expect(link).toBe(String.raw`[x\](javascript:alert(1)) \[y](` + `${TASK_URL})`);
    // The only unescaped `](` — the label/destination boundary — is ours.
    expect(link.match(/(?<!\\)\]\(/g)).toHaveLength(1);
    expect(link.endsWith(`](${TASK_URL})`)).toBe(true);
  });

  it('cannot be closed early by a trailing backslash in the title', () => {
    expect(markdownLink('x\\', TASK_URL)).toBe(`[x\\\\](${TASK_URL})`);
  });

  it('percent-encodes characters that would end the destination', () => {
    expect(markdownLink('t', 'https://example.com/a (b)<c>')).toBe(
      '[t](https://example.com/a%20%28b%29%3Cc%3E)',
    );
  });
});

describe('taskMarkdownDocument', () => {
  it('joins heading, description and link with blank lines', () => {
    expect(
      taskMarkdownDocument({
        identifier: 'ENG-7',
        instruction: 'Do the work.\n',
        title: 'Ship',
        url: TASK_URL,
      }),
    ).toBe(`# ENG-7: Ship\n\nDo the work.\n\n${TASK_URL}`);
  });

  it('omits an empty description', () => {
    expect(taskMarkdownDocument({ identifier: 'ENG-7', title: 'Ship', url: TASK_URL })).toBe(
      `# ENG-7: Ship\n\n${TASK_URL}`,
    );
  });

  it('keeps a multi-line title on the heading line', () => {
    expect(taskMarkdownDocument({ identifier: 'ENG-7', title: 'a\n# b [c]', url: TASK_URL })).toBe(
      String.raw`# ENG-7: a # b \[c\]` + `\n\n${TASK_URL}`,
    );
  });
});
