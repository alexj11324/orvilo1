import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';
import type { PropsWithChildren, RefObject } from 'react';
import { memo, useEffect } from 'react';

import { ScrollBar } from '@/components/ui/scroll-area';
import { useAutoScroll } from '@/hooks/useAutoScroll';

interface AutoScrollShadowProps extends PropsWithChildren {
  /**
   * Content string to track for auto-scrolling
   */
  content?: string;
  /**
   * Whether the content is currently streaming/generating
   */
  streaming?: boolean;
}

const AutoScrollShadow = memo<AutoScrollShadowProps>(({ children, content, streaming }) => {
  const { ref, handleScroll, resetScrollLock } = useAutoScroll<HTMLDivElement>({
    deps: [content],
    enabled: streaming,
  });

  // Reset scroll lock when content is cleared (new stream starts)
  useEffect(() => {
    if (!content) {
      resetScrollLock();
    }
  }, [content, resetScrollLock]);

  return (
    <ScrollAreaPrimitive.Root style={{ background: 'transparent', borderRadius: 0 }}>
      <ScrollAreaPrimitive.Viewport
        ref={ref as RefObject<HTMLDivElement>}
        style={{ height: 'max(33vh, 480px)' }}
        onScroll={handleScroll}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
});

export default AutoScrollShadow;
