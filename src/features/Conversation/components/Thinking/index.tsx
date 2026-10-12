import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { memo, useEffect, useState } from 'react';

import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { ScrollBar } from '@/components/ui/scroll-area';
import MarkdownMessage from '@/features/Conversation/Markdown';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { type ChatCitationItem } from '@/types/index';

import StatusIndicator from './StatusIndicator';

const styles = {
  contentScroll: 'max-h-[min(40vh,320px)] pbe-2 px-2 text-foreground-description',
  scrollRoot: 'rounded-none bg-transparent',
};

interface ThinkingProps {
  citations?: ChatCitationItem[];
  content?: string | ReactNode;
  duration?: number;
  style?: CSSProperties;
  thinking?: boolean;
  thinkingAnimated?: boolean;
}

const Thinking = memo<ThinkingProps>((props) => {
  const { content, duration, thinking, citations, thinkingAnimated } = props;
  const [showDetail, setShowDetail] = useState(false);

  const { ref, handleScroll } = useAutoScroll<HTMLDivElement>({
    deps: [content, showDetail],
    enabled: thinking && showDetail,
    threshold: 120,
  });

  useEffect(() => {
    setShowDetail(!!thinking);
  }, [thinking]);

  return (
    <Reasoning
      className="mb-0"
      duration={duration === undefined ? undefined : Number((duration / 1000).toFixed(1))}
      isStreaming={thinking}
      open={showDetail}
      style={props.style}
      onOpenChange={setShowDetail}
    >
      <ReasoningTrigger icon={thinking ? <StatusIndicator thinking /> : undefined} />
      <ReasoningContent className="mt-2">
        {
          <ScrollAreaPrimitive.Root className={styles.scrollRoot}>
            <ScrollAreaPrimitive.Viewport
              className={styles.contentScroll}
              ref={ref as RefObject<HTMLDivElement>}
              onScroll={handleScroll}
            >
              {typeof content === 'string' ? (
                <MarkdownMessage
                  animated={thinkingAnimated}
                  citations={citations}
                  streaming={thinking}
                  variant={'chat'}
                  style={{
                    overflow: 'unset',
                  }}
                >
                  {content}
                </MarkdownMessage>
              ) : (
                content
              )}
            </ScrollAreaPrimitive.Viewport>
            <ScrollBar />
            <ScrollAreaPrimitive.Corner />
          </ScrollAreaPrimitive.Root>
        }
      </ReasoningContent>
    </Reasoning>
  );
});

export default Thinking;
