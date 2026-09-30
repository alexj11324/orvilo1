import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';
import { type ReactNode, type UIEvent } from 'react';
import { memo, Suspense, useCallback, useLayoutEffect, useRef } from 'react';

import { ScrollBar } from '@/components/ui/scroll-area';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SideBarHeaderSkeleton } from '@/features/NavPanel/components/SideBarSkeleton';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';

import { useActiveNavKey } from './useActiveNavKey';

const scrollOffsets = new Map<string, number>();

interface SidebarLayoutProps {
  body?: ReactNode;
  header?: ReactNode;
  /** Scroll-memory bucket — defaults to the active nav key. Pass a stable key
      when the layout renders outside its own nav panel (e.g. an in-page rail)
      so its offset never collides with the workspace panel's. */
  scrollKey?: string;
}

const SideBarLayout = memo<SidebarLayoutProps>(({ header, body, scrollKey }) => {
  const activeNavKey = useActiveNavKey();
  const navKey = scrollKey ?? activeNavKey;
  const scrollerRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      scrollOffsets.set(navKey, e.currentTarget.scrollTop);
    },
    [navKey],
  );

  // Runs on mount and on Activity reveal; display:none drops the browser's own offset.
  useLayoutEffect(() => {
    const offset = scrollOffsets.get(navKey);
    if (offset && scrollerRef.current) scrollerRef.current.scrollTop = offset;
  }, [navKey]);

  return (
    <div className="flex flex-col gap-[1px]" style={{ height: '100%', overflow: 'hidden' }}>
      <Suspense fallback={<SideBarHeaderSkeleton />}>{header}</Suspense>
      <ScrollAreaPrimitive.Root
        // Preserve the height chain for sidebar bodies containing virtual lists.
        className="relative"
        style={{ flex: 1, minHeight: 0 }}
      >
        <ScrollAreaPrimitive.Viewport
          className="size-full"
          ref={scrollerRef}
          onScroll={handleScroll}
        >
          <TooltipProvider>
            <Suspense fallback={<SkeletonList style={{ paddingBlock: 8 }} />}>{body}</Suspense>
          </TooltipProvider>
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar />
        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>
    </div>
  );
});

export default SideBarLayout;
