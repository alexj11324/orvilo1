/**
 * @vitest-environment happy-dom
 */
import type { AssistantContentBlock, UIChatMessage } from '@orvilo/types';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MessageActionContext } from '../types';
import { copyAsMarkdownAction } from './copyAsMarkdown';

const mocks = vi.hoisted(() => ({
  copyToClipboard: vi.fn(),
  messageSuccess: vi.fn(),
}));

vi.mock('@lobehub/ui', () => ({
  copyToClipboard: mocks.copyToClipboard,
}));

vi.mock('@lobehub/ui/base-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  toast: { success: mocks.messageSuccess },
}));

vi.mock('antd', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  App: { useApp: () => ({ message: { success: mocks.messageSuccess } }) },
}));

const build = (
  data: Partial<UIChatMessage> = {},
  role: MessageActionContext['role'] = 'assistant',
  contentBlock?: Partial<AssistantContentBlock>,
) =>
  renderHook(() =>
    copyAsMarkdownAction.useBuild({
      contentBlock: contentBlock as AssistantContentBlock,
      data: { content: 'Hello', role: 'assistant', ...data } as UIChatMessage,
      id: 'message-1',
      role,
    }),
  ).result.current;

describe('copyAsMarkdownAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is absent on user messages — plain copy already normalizes them', () => {
    expect(build({}, 'user')).toBeNull();
  });

  it('copies assistant content verbatim when no normalization is needed', async () => {
    const action = build({ content: '**Hello** world' });

    await act(async () => action?.handleClick?.());

    expect(mocks.copyToClipboard).toHaveBeenCalledWith('**Hello** world');
    expect(mocks.messageSuccess).toHaveBeenCalled();
  });

  it('normalizes escaped markdown punctuation out of the copied source', async () => {
    const action = build({ content: 'a \\*literal\\* star and \\[not a link\\]' });

    await act(async () => action?.handleClick?.());

    expect(mocks.copyToClipboard).toHaveBeenCalledWith('a *literal* star and [not a link]');
  });

  it('strips an echoed speaker tag before copying', async () => {
    const action = build({ content: '<speaker name="Agent" />\nReply body' });

    await act(async () => action?.handleClick?.());

    expect(mocks.copyToClipboard).toHaveBeenCalledWith('Reply body');
  });

  it('keeps backslashes inside fenced code blocks untouched', async () => {
    const action = build({ content: '```\nconst a = "\\\\path";\n```' });

    await act(async () => action?.handleClick?.());

    expect(mocks.copyToClipboard).toHaveBeenCalledWith('```\nconst a = "\\\\path";\n```');
  });

  it('copies the content block for group messages', async () => {
    const action = build({ content: 'outer' }, 'group', {
      content: 'block body',
      id: 'block-1',
    });

    await act(async () => action?.handleClick?.());

    expect(mocks.copyToClipboard).toHaveBeenCalledWith('block body');
  });
});
