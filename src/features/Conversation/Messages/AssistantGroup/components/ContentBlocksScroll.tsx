'use client';

import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';
import type { UIChatMessage } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import type { RefObject } from 'react';
import { memo, useMemo } from 'react';

import { ScrollBar } from '@/components/ui/scroll-area';

import { resolveAssistantGroupFromMessages } from '../utils/resolveAssistantGroupFromMessages';
import ContentBlock from './ContentBlock';
import type { RenderableAssistantContentBlock } from './types';

const styles = createStaticStyles(({ css }) => ({
  scrollRoot: css`
    border-radius: 0;
    background: transparent;
  `,
  scrollTask: css`
    max-height: min(50vh, 300px);
  `,
  scrollWorkflow: css`
    max-height: min(40vh, 320px);
  `,
}));

interface ContentBlocksScrollBaseProps {
  disableEditing?: boolean;
  onScroll?: () => void;
  scroll?: boolean;
  scrollRef?: RefObject<HTMLDivElement | null>;
  variant: 'task' | 'workflow';
}

interface ContentBlocksScrollFromBlocks extends ContentBlocksScrollBaseProps {
  assistantId: string;
  blocks: RenderableAssistantContentBlock[];
  messages?: never;
}

interface ContentBlocksScrollFromMessages extends ContentBlocksScrollBaseProps {
  assistantId?: never;
  blocks?: never;
  messages: UIChatMessage[];
}

export type ContentBlocksScrollProps =
  ContentBlocksScrollFromBlocks | ContentBlocksScrollFromMessages;

const ContentBlocksScroll = memo<ContentBlocksScrollProps>((props) => {
  const { disableEditing, onScroll, scroll = true, scrollRef, variant } = props;

  const messagesList = 'messages' in props ? props.messages : undefined;
  const assistantIdFromProps = 'messages' in props ? undefined : props.assistantId;
  const blocksFromProps = 'messages' in props ? undefined : props.blocks;

  const { assistantId, blocks } = useMemo<{
    assistantId: string;
    blocks: RenderableAssistantContentBlock[];
  }>(() => {
    if (messagesList !== undefined) {
      return resolveAssistantGroupFromMessages(messagesList);
    }
    return {
      assistantId: assistantIdFromProps ?? '',
      blocks: blocksFromProps ?? [],
    };
  }, [assistantIdFromProps, blocksFromProps, messagesList]);

  const list = (
    <div className="flex flex-col" style={{ gap: variant === 'workflow' ? 8 : undefined }}>
      {blocks.map((block) => (
        <ContentBlock
          key={block.renderKey ?? block.id}
          {...block}
          assistantId={assistantId}
          disableEditing={disableEditing}
        />
      ))}
    </div>
  );

  const body =
    variant === 'workflow' ? (
      <div className="flex flex-col" style={{ paddingBlock: '4px 8px' }}>
        {list}
      </div>
    ) : (
      list
    );

  if (!scroll) {
    return body;
  }

  const scrollClass = variant === 'task' ? styles.scrollTask : styles.scrollWorkflow;

  return (
    <ScrollAreaPrimitive.Root className={styles.scrollRoot}>
      <ScrollAreaPrimitive.Viewport
        className={scrollClass}
        ref={scrollRef as RefObject<HTMLDivElement>}
        style={{ paddingInlineEnd: 12 }}
        onScroll={onScroll}
      >
        {body}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar style={{ marginInlineEnd: 2 }} />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
});

ContentBlocksScroll.displayName = 'ContentBlocksScroll';

export default ContentBlocksScroll;
