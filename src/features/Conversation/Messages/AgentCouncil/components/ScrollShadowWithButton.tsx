import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';
import { cx } from 'antd-style';
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
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'react-responsive';

import { Button } from '@/components/ui/button';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

const styles = {
  button:
    'absolute z-10 top-1/2 [transform:translateY(-50%)] text-muted-foreground opacity-0 transition-opacity duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-in-out) hover:border-border hover:shadow-(--shadow-raised)',
  container:
    'relative [&:hover_.scroll-button]:opacity-100 [&:focus-within_.scroll-button]:opacity-100 [@media(hover:none)]:[&_.scroll-button]:opacity-100',
  leftButton: 'start-4',
  rightButton: 'end-4',
};

type ScrollShadowWithButtonProps = ComponentProps<'div'> & {
  justify?: CSSProperties['justifyContent'];
};

const ScrollShadowWithButton = memo<ScrollShadowWithButtonProps>(
  ({ children, justify, style, ...rest }) => {
    const { t: tCommon } = useTranslation('common');
    const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
    const reducedMotion = useMediaQuery({ query: '(prefers-reduced-motion: reduce)' });
    const motionEnabled = animationMode !== 'disabled' && !reducedMotion;
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
          behavior: motionEnabled ? 'smooth' : 'instant',
          left: targetScroll,
        });

        setTimeout(checkScrollability, 300);
      },
      [checkScrollability, motionEnabled],
    );

    // A preference change must also stop a native smooth scroll already in flight.
    // Preserve the browser's current continuous coordinates; do not round or reset them.
    useEffect(() => {
      if (motionEnabled) return;
      const container = scrollRef.current;
      if (!container) return;
      container.scrollTo({
        behavior: 'instant',
        left: container.scrollLeft,
        top: container.scrollTop,
      });
    }, [motionEnabled]);

    useEffect(() => {
      checkScrollability();
    }, [checkScrollability]);

    return (
      <div
        className={cx('flex', styles.container)}
        style={{ justifyContent: justify, width: '100%', ...style }}
        {...rest}
      >
        {canScrollLeft && (
          <Button
            aria-label={tCommon('previous')}
            className={cx(styles.button, styles.leftButton, 'scroll-button', 'rounded-full')}
            size="compact"
            variant="outline"
            onClick={() => handleScroll('left')}
          >
            <ChevronLeft className="size-4" data-icon="inline-start" />
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
            aria-label={tCommon('next')}
            className={cx(styles.button, styles.rightButton, 'scroll-button', 'rounded-full')}
            size="compact"
            variant="outline"
            onClick={() => handleScroll('right')}
          >
            <ChevronRight className="size-4" data-icon="inline-start" />
          </Button>
        )}
      </div>
    );
  },
);

export default ScrollShadowWithButton;
