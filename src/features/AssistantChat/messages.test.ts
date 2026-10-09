import { LOADING_FLAT } from '@orvilo/const';
import type { UIChatMessage } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { type MessageSource, toAssistantMessage } from './messages';

const message = (patch: Partial<UIChatMessage>): UIChatMessage => ({
  id: 'message',
  content: '',
  role: 'assistant',
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});

describe('assistant-ui message bridge', () => {
  it('keeps selection-only messages nonempty and preserves author metadata', () => {
    const input = message({
      role: 'user',
      sender: { id: 'other', fullName: 'Teammate' },
      metadata: {
        pageSelections: [
          { id: 'selection', pageId: 'page', title: 'Source', content: 'Selected text' },
        ],
      },
    });
    const result = toAssistantMessage(input);
    expect(result.content).toEqual([
      { type: 'data', name: 'orvilo-selections', data: input.metadata?.pageSelections },
    ]);
    expect((result.metadata?.custom?.orvilo as MessageSource).message.sender).toEqual(input.sender);
  });

  it('renders grouped blocks in order without repeating the final answer', () => {
    const result = toAssistantMessage(
      message({
        content: 'Final answer',
        children: [
          { id: 'a', content: 'First step' },
          { id: 'b', content: 'Final answer' },
        ],
      }),
    );
    expect(result.content).toEqual([
      { type: 'text', text: 'First step' },
      { type: 'text', text: 'Final answer' },
    ]);
  });

  it('keeps reused tool ids distinct and preserves original approval routing', () => {
    const tool = {
      id: 'call',
      identifier: 'filesystem',
      apiName: 'read',
      arguments: '{"path":"a"}',
      type: 'builtin' as const,
    };
    const result = toAssistantMessage(
      message({
        children: [
          { id: 'first', content: '', tools: [tool] },
          { id: 'second', content: '', tools: [tool] },
        ],
      }),
    );
    const source = result.metadata?.custom?.orvilo as MessageSource;
    expect(Object.keys(source.tools)).toEqual(['first:call', 'second:call']);
    expect(source.tools['second:call']).toEqual({ blockId: 'second', tool });
  });

  it('does not display loading sentinels or duplicate standalone tool output', () => {
    expect(toAssistantMessage(message({ content: LOADING_FLAT })).content).toEqual([]);
    const result = toAssistantMessage(
      message({
        role: 'tool',
        content: 'Result',
        plugin: { identifier: 'test', apiName: 'run', arguments: '{}', type: 'builtin' },
      }),
    );
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({ type: 'tool-call', result: 'Result' });
  });

  it('retains errors, task navigation and attachments in the render tree', () => {
    const result = toAssistantMessage(
      message({
        error: { message: 'Failed', type: 'InternalServerError' },
        taskDetail: { status: 'completed', threadId: 'thread-a' },
        fileList: [
          { id: 'file-a', name: 'notes.txt', url: '/notes.txt', size: 12, fileType: 'text/plain' },
        ],
      }),
    );
    expect(result.status).toMatchObject({ type: 'incomplete', reason: 'error' });
    expect(result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'orvilo-task',
          data: expect.objectContaining({ threadId: 'thread-a' }),
        }),
        expect.objectContaining({ name: 'orvilo-media' }),
        expect.objectContaining({ name: 'orvilo-error' }),
      ]),
    );
  });
});
