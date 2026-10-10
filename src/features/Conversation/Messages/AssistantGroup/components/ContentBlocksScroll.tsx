'use client';

import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';
import type { UIChatMessage } from '@orvilo/types';
import type { RefObject } from 'react';
import { memo, useMemo } from 'react';

import { ScrollBar } from '@/components/ui/scroll-area';

import { resolveAssistantGroupFromMessages } from '../utils/resolveAssistantGroupFromMessages';
import ContentBlock from './ContentBlock';
import type { RenderableAssistantContentBlock } from './types';

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
    <div className={variant === 'workflow' ? 'flex flex-col gap-2' : 'flex flex-col'}>
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
    variant === 'workflow' ? <div className="flex flex-col pt-1 pb-2">{list}</div> : list;

  if (!scroll) {
    return body;
  }

  const scrollClass =
    variant === 'task'
      ? 'max-h-[min(50vh,--spacing(75))] pe-3'
      : 'max-h-[min(40vh,--spacing(80))] pe-3';

  return (
    <ScrollAreaPrimitive.Root className="rounded-none bg-transparent">
      <ScrollAreaPrimitive.Viewport
        className={scrollClass}
        ref={scrollRef as RefObject<HTMLDivElement>}
        onScroll={onScroll}
      >
        {body}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar className="me-0.5" />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
});

ContentBlocksScroll.displayName = 'ContentBlocksScroll';

export default ContentBlocksScroll;
