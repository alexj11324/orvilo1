import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';
import { createStaticStyles, cx } from 'antd-style';
import { cn } from 'cn';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  type ComponentProps,
  type CSSProperties,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { Button } from '@/components/ui/button';

const styles = createStaticStyles(({ css, cssVar }) => ({
  button: css`
    position: absolute;
    z-index: 10;
    inset-block-start: 50%;
    transform: translateY(-50%);

    color: ${cssVar.colorTextSecondary};

    opacity: 0;

    transition: opacity ${cssVar.motionDurationMid} ${cssVar.motionEaseInOut};

    &:hover {
      border-color: ${cssVar.colorBorder} !important;
      box-shadow: ${cssVar.boxShadowTertiary} !important;
    }
  `,
  container: css`
    position: relative;

    &:hover .scroll-button {
      opacity: 1;
    }
  `,
  leftButton: css`
    inset-inline-start: 16px;
  `,
  rightButton: css`
    inset-inline-end: 16px;
  `,
}));

type ScrollShadowWithButtonProps = ComponentProps<'div'> & {
  justify?: CSSProperties['justifyContent'];
};

const ScrollShadowWithButton = memo<ScrollShadowWithButtonProps>(
  ({ children, justify, style, ...rest }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);

    const checkScrollability = useCallback(() => {
      const container = scrollRef.current;
      if (!container) return;

      const { scrollLeft, scrollWidth, clientWidth } = container;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
    }, []);

    const handleScroll = useCallback(
      (direction: 'left' | 'right') => {
        const container = scrollRef.current;
        if (!container) return;

        const scrollAmount = container.clientWidth / 1.5;
        const targetScroll =
          direction === 'left'
            ? container.scrollLeft - scrollAmount
            : container.scrollLeft + scrollAmount;

        container.scrollTo({
          behavior: 'smooth',
          left: targetScroll,
        });

        setTimeout(checkScrollability, 300);
      },
      [checkScrollability],
    );

    useEffect(() => {
      checkScrollability();
    }, []);

    return (
      <div
        className={cn('flex', styles.container)}
        style={{ justifyContent: justify, width: '100%', ...style }}
        {...rest}
      >
        {canScrollLeft && (
          <Button
            className={cx(styles.button, styles.leftButton, 'scroll-button', 'rounded-full')}
            variant="outline"
            onClick={() => handleScroll('left')}
          >
            <ChevronLeft data-icon="inline-start" />
          </Button>
        )}
        <ScrollAreaPrimitive.Root>
          <ScrollAreaPrimitive.Viewport
            ref={scrollRef}
            onScroll={checkScrollability}
            onScrollCapture={checkScrollability}
          >
            {children}
          </ScrollAreaPrimitive.Viewport>
          <ScrollAreaPrimitive.Corner />
        </ScrollAreaPrimitive.Root>
        {canScrollRight && (
          <Button
            className={cx(styles.button, styles.rightButton, 'scroll-button', 'rounded-full')}
            variant="outline"
            onClick={() => handleScroll('right')}
          >
            <ChevronRight data-icon="inline-start" />
          </Button>
        )}
      </div>
    );
  },
);

export default ScrollShadowWithButton;
