import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';
import { memo, type RefObject } from 'react';

import { ChainOfThoughtStep } from '@/components/ai-elements/chain-of-thought';
import { ScrollBar } from '@/components/ui/scroll-area';

import ContentBlock from './ContentBlock';
import type { RenderableAssistantContentBlock } from './types';

interface WorkflowExpandedListProps {
  assistantId: string;
  blocks: RenderableAssistantContentBlock[];
  constrained?: boolean;
  disableEditing?: boolean;
  onScroll?: () => void;
  scrollRef?: RefObject<HTMLDivElement | null>;
  streaming?: boolean;
}

const WorkflowExpandedList = memo<WorkflowExpandedListProps>(
  ({ assistantId, blocks, constrained, disableEditing, onScroll, scrollRef, streaming }) => {
    const content = (
      <div className="space-y-3">
        {blocks.map((block, index) => (
          <ChainOfThoughtStep
            key={block.renderKey ?? block.id}
            status={streaming && index === blocks.length - 1 ? 'active' : 'complete'}
          >
            <ContentBlock {...block} assistantId={assistantId} disableEditing={disableEditing} />
          </ChainOfThoughtStep>
        ))}
      </div>
    );
    if (!constrained) return content;
    // Preserve the existing bounded process viewport and its scroll callback;
    // this is not a second conversation auto-scroll engine.
    return (
      <ScrollAreaPrimitive.Root>
        <ScrollAreaPrimitive.Viewport
          className="max-h-[min(40vh,320px)] pr-3"
          ref={scrollRef}
          onScroll={onScroll}
        >
          {content}
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar />
        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>
    );
  },
);

WorkflowExpandedList.displayName = 'WorkflowExpandedList';
export default WorkflowExpandedList;
