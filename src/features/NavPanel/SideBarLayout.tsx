import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';
import { type ReactNode, type UIEvent } from 'react';
import { memo, Suspense, useCallback, useLayoutEffect, useRef } from 'react';

import { ScrollBar } from '@/components/ui/scroll-area';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SideBarHeaderSkeleton } from '@/features/NavPanel/components/SideBarSkeleton';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';

import { useActiveNavKey } from './useActiveNavKey';

const scrollOffsets = new Map<string, number>();

// Base UI publishes inherited overflow distances. The opaque mask stops are
// alpha coverage, not a visual palette. Global @property/keyframes retain the
// scroll timeline interpolation; ThemeRoles stops the viewport's motion under
// disabled animation or prefers-reduced-motion without removing its edge mask.
const scrollFadeClassName = [
  'size-full [--scroll-area-overflow-y-start:inherit] [--scroll-area-overflow-y-end:inherit]',
  '[--sidebar-fade-size:calc(var(--spacing)*10)]',
  '[--sidebar-fade-top:min(var(--sidebar-fade-size),var(--scroll-area-overflow-y-start,0px))]',
  '[--sidebar-fade-bottom:min(var(--sidebar-fade-size),var(--scroll-area-overflow-y-end,0px))]',
  '[mask-image:linear-gradient(to_bottom,transparent_0,black_var(--sidebar-fade-top),black_calc(100%_-_var(--sidebar-fade-bottom)),transparent_100%)] [mask-repeat:no-repeat] [mask-size:100%_100%]',
  'supports-[animation-timeline:scroll()]:[animation-name:orvilo-sidebar-scroll-fade-top-in,orvilo-sidebar-scroll-fade-bottom-out]',
  'supports-[animation-timeline:scroll()]:[animation-duration:1ms,1ms]',
  'supports-[animation-timeline:scroll()]:[animation-timing-function:linear,linear]',
  'supports-[animation-timeline:scroll()]:[animation-fill-mode:both,both]',
  'supports-[animation-timeline:scroll()]:[animation-timeline:scroll(self_y),scroll(self_y)]',
  'supports-[animation-timeline:scroll()]:[animation-range:0_var(--sidebar-fade-size),calc(100%_-_var(--sidebar-fade-size))_100%]',
].join(' ');

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
    <div className="flex h-full flex-col gap-px overflow-hidden">
      <Suspense fallback={<SideBarHeaderSkeleton />}>{header}</Suspense>
      <ScrollAreaPrimitive.Root
        // Preserve the height chain for sidebar bodies containing virtual lists.
        className="relative min-h-0 flex-1"
      >
        <ScrollAreaPrimitive.Viewport
          className={scrollFadeClassName}
          data-slot="sidebar-scroll-viewport"
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
