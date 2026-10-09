/**
 * @vitest-environment happy-dom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ContentBlocksScroll from './ContentBlocksScroll';
import type { RenderableAssistantContentBlock } from './types';
import WorkflowExpandedList from './WorkflowExpandedList';

vi.mock('./ContentBlock', () => ({
  default: ({ disableMarkdownStreaming, id }: RenderableAssistantContentBlock) => (
    <div
      data-block-id={id}
      data-disable-markdown-streaming={String(!!disableMarkdownStreaming)}
      data-testid="content-block"
    />
  ),
}));

describe('ContentBlocksScroll', () => {
  it('does not disable markdown streaming for the first block of a workflow subset', () => {
    render(
      <ContentBlocksScroll
        assistantId="assistant-1"
        blocks={[{ content: 'workflow block', id: 'block-2' }]}
        scroll={false}
        variant="workflow"
      />,
    );

    expect(screen.getByTestId('content-block')).toHaveAttribute(
      'data-disable-markdown-streaming',
      'false',
    );
  });

  it('preserves precomputed markdown streaming disable flag', () => {
    render(
      <ContentBlocksScroll
        assistantId="assistant-1"
        blocks={[{ content: 'first group block', disableMarkdownStreaming: true, id: 'block-1' }]}
        scroll={false}
        variant="workflow"
      />,
    );

    expect(screen.getByTestId('content-block')).toHaveAttribute(
      'data-disable-markdown-streaming',
      'true',
    );
  });

  it('uses a consistent gap between workflow blocks', () => {
    render(
      <ContentBlocksScroll
        assistantId="assistant-1"
        scroll={false}
        variant="workflow"
        blocks={[
          { content: 'first workflow block', id: 'block-1' },
          { content: 'second workflow block', id: 'block-2' },
        ]}
      />,
    );

    const [firstBlock] = screen.getAllByTestId('content-block');
    expect(firstBlock.parentElement!).toHaveStyle({ gap: '8px' });
  });
  it('preserves projected Markdown streaming flags in the AI Elements workflow timeline', () => {
    render(
      <WorkflowExpandedList
        streaming
        assistantId="assistant-1"
        blocks={[
          { content: 'settled step', disableMarkdownStreaming: true, id: 'block-1' },
          { content: 'streaming step', disableMarkdownStreaming: false, id: 'block-2' },
        ]}
      />,
    );
    const blocks = screen.getAllByTestId('content-block');
    expect(blocks.map((block) => block.getAttribute('data-disable-markdown-streaming'))).toEqual([
      'true',
      'false',
    ]);
    expect(blocks.map((block) => block.getAttribute('data-block-id'))).toEqual([
      'block-1',
      'block-2',
    ]);
  });
});
