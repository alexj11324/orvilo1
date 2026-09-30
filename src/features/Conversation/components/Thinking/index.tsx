import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';
import { createStaticStyles } from 'antd-style';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { memo, useEffect, useState } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ScrollBar } from '@/components/ui/scroll-area';
import MarkdownMessage from '@/features/Conversation/Markdown';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { type ChatCitationItem } from '@/types/index';

import Title from './Title';

const styles = createStaticStyles(({ css, cssVar }) => ({
  contentScroll: css`
    max-height: min(40vh, 320px);
    padding-block-end: 8px;
    padding-inline: 8px;
    color: ${cssVar.colorTextDescription};

    article * {
      color: ${cssVar.colorTextDescription};
    }
  `,
  scrollRoot: css`
    border-radius: 0;
    background: transparent;
  `,
}));

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
    <Accordion
      multiple
      className="gap-2"
      value={showDetail ? ['thinking'] : []}
      onValueChange={(keys) => setShowDetail(keys.length > 0)}
    >
      <AccordionItem value="thinking">
        <AccordionTrigger style={{ paddingBlock: 4, paddingInline: 4 }}>
          <Title duration={duration} showDetail={showDetail} thinking={thinking} />
        </AccordionTrigger>
        <AccordionContent>
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
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
});

export default Thinking;
