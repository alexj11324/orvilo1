import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';
import { createGlobalStyle, createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { type ReactNode, type UIEvent } from 'react';
import { memo, Suspense, useCallback, useLayoutEffect, useRef } from 'react';

import { ScrollBar } from '@/components/ui/scroll-area';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SideBarHeaderSkeleton } from '@/features/NavPanel/components/SideBarSkeleton';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';

import { useActiveNavKey } from './useActiveNavKey';

const scrollOffsets = new Map<string, number>();

// Register the fade custom properties as lengths so scroll-driven animation
// interpolates smoothly instead of snapping at scroll edges.
const ScrollFadeProperties = createGlobalStyle`
  @property --sidebar-fade-top {
    inherits: true;
    initial-value: 0;
    syntax: '<length>';
  }

  @property --sidebar-fade-bottom {
    inherits: true;
    initial-value: 0;
    syntax: '<length>';
  }
`;

const styles = createStaticStyles(({ css }) => ({
  // Edge fade on the scroll viewport: mask fades content near the top/bottom
  // edges, driven by distance to each edge (first/last 40px). Base UI's
  // ScrollArea.Viewport already publishes --scroll-area-overflow-y-* px values.
  scrollFade: css`
    --scroll-area-overflow-y-start: inherit;
    --scroll-area-overflow-y-end: inherit;
    --sidebar-fade-size: 40px;
    --sidebar-fade-top: min(var(--sidebar-fade-size), var(--scroll-area-overflow-y-start, 0px));
    --sidebar-fade-bottom: min(var(--sidebar-fade-size), var(--scroll-area-overflow-y-end, 0px));

    mask-image: linear-gradient(
      to bottom,
      transparent 0,
      #000 var(--sidebar-fade-top),
      #000 calc(100% - var(--sidebar-fade-bottom)),
      transparent 100%
    );
    mask-repeat: no-repeat;
    mask-size: 100% 100%;

    @supports (animation-timeline: scroll()) {
      @keyframes sidebar-scroll-fade-top-in {
        from {
          --sidebar-fade-top: 0;
        }

        to {
          --sidebar-fade-top: var(--sidebar-fade-size);
        }
      }

      @keyframes sidebar-scroll-fade-bottom-out {
        from {
          --sidebar-fade-bottom: var(--sidebar-fade-size);
        }

        to {
          --sidebar-fade-bottom: 0;
        }
      }

      animation-name: sidebar-scroll-fade-top-in, sidebar-scroll-fade-bottom-out;
      animation-duration: 1ms, 1ms;
      animation-timing-function: linear, linear;
      animation-fill-mode: both, both;
      animation-timeline: scroll(self y), scroll(self y);

      animation-range:
        0 var(--sidebar-fade-size),
        calc(100% - var(--sidebar-fade-size)) 100%;
    }
  `,
}));

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
      <ScrollFadeProperties />
      <Suspense fallback={<SideBarHeaderSkeleton />}>{header}</Suspense>
      <ScrollAreaPrimitive.Root
        // Preserve the height chain for sidebar bodies containing virtual lists.
        className="relative"
        style={{ flex: 1, minHeight: 0 }}
      >
        <ScrollAreaPrimitive.Viewport
          className={cn('size-full', styles.scrollFade)}
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
