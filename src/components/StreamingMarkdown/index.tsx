'use client';

import { ScrollArea } from '@base-ui/react/scroll-area';
import type { RefObject } from 'react';
import { memo, useEffect } from 'react';

import { Markdown } from '@/components/Markdown';
import { useAutoScroll } from '@/hooks/useAutoScroll';

interface StreamingMarkdownProps {
  children?: string;
  maxHeight?: number;
}

const StreamingMarkdown = memo<StreamingMarkdownProps>(({ children, maxHeight = 400 }) => {
  const { ref, handleScroll, resetScrollLock } = useAutoScroll<HTMLDivElement>({
    deps: [children],
  });

  // Reset scroll lock when content is cleared (new stream starts)
  useEffect(() => {
    if (!children) {
      resetScrollLock();
    }
  }, [children, resetScrollLock]);

  if (!children) return null;

  return (
    <ScrollArea.Root className={'rounded-none bg-transparent'}>
      <ScrollArea.Viewport
        className={'py-3 px-4 rounded-(--radius-card) text-sm'}
        ref={ref as RefObject<HTMLDivElement>}
        style={{ maxHeight }}
        onScroll={handleScroll}
      >
        <Markdown animated streaming style={{ overflow: 'unset' }} variant={'chat'}>
          {children}
        </Markdown>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar orientation={'vertical'}>
        <ScrollArea.Thumb />
      </ScrollArea.Scrollbar>
      <ScrollArea.Corner />
    </ScrollArea.Root>
  );
});

StreamingMarkdown.displayName = 'StreamingMarkdown';

export default StreamingMarkdown;
