'use client';

import { cn } from 'cn';
import Autoplay from 'embla-carousel-autoplay';
import { X } from 'lucide-react';
import * as m from 'motion/react-m';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, buttonVariants } from '@/components/ui/button';
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSingleton } from '@/hooks/useSingleton';
import { useAnalytics } from '@/libs/analytics/client';
import type { GlobalBillboard, GlobalBillboardItem } from '@/types/serverConfig';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { resolveBillboardAction, runBillboardAction } from './actions';
import { resolveBillboardItem } from './locale';

type BillboardItem = GlobalBillboardItem;

interface BillboardCarouselProps {
  cardAttr?: string;
  closing?: boolean;
  exitTarget?: { x: number; y: number };
  onAnimationFinish?: () => void;
  onClose: () => void;
  set: GlobalBillboard;
}

const styles = {
  action: 'w-full mbs-2',
  card: 'fixed z-1000 inset-be-14 inset-s-2 origin-bottom-left rtl:origin-bottom-right overflow-hidden flex flex-col w-75 max-w-[calc(100vw_-_32px)] p-0 border border-border rounded-(--radius-overlay) bg-card shadow-(--shadow-popover)',
  closeButton:
    'absolute z-10 inset-bs-2 inset-e-2 border-border bg-card text-foreground shadow-(--shadow-popover) hover:bg-card hover:text-foreground',
  description: 'line-clamp-4 text-sm leading-5.5 text-muted-foreground',
  dot: 'block h-1.5 w-1.5 shrink-0 rounded-full bg-selected transition-[width,background-color] duration-(--orvilo-motion-mid)',
  dotActive: 'w-4.5 bg-primary',
  dots: 'flex-wrap pbe-2.5',
  image: 'block w-full h-35 border-be border-divider object-cover',
  itemBody: 'p-4',
  title: 'line-clamp-2 text-base leading-6 font-semibold text-foreground',
};

const ItemContent = memo<{
  billboardSlug: string;
  item: BillboardItem;
  onClose: () => void;
  position: number;
}>(({ item, billboardSlug, position, onClose }) => {
  const { t, i18n } = useTranslation('notification');
  const { analytics } = useAnalytics();
  const resolved = useMemo(() => resolveBillboardItem(item, i18n.language), [item, i18n.language]);

  const action = resolveBillboardAction(item.action);

  const trackCtaClick = useCallback(
    (extra: Record<string, unknown>) => {
      analytics?.track({
        name: 'billboard_cta_clicked',
        properties: {
          billboard_slug: billboardSlug,
          item_id: item.id,
          position,
          spm: 'billboard.cta.clicked',
          ...extra,
        },
      });
    },
    [analytics, billboardSlug, item.id, position],
  );

  const handleActionClick = useCallback(async () => {
    if (!action) return;
    trackCtaClick({ action });
    onClose();
    await Promise.resolve(runBillboardAction(action)).catch(() => {});
  }, [action, trackCtaClick, onClose]);

  const handleLinkClick = useCallback(() => {
    trackCtaClick({ link_url: item.linkUrl });
    onClose();
  }, [trackCtaClick, item.linkUrl, onClose]);

  const titleRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLDivElement>(null);
  const [titleOverflow, setTitleOverflow] = useState(false);
  const [descOverflow, setDescOverflow] = useState(false);

  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    setTitleOverflow(el.scrollHeight > el.clientHeight + 1);
  }, [resolved.title]);

  useLayoutEffect(() => {
    const el = descRef.current;
    if (!el) return;
    setDescOverflow(el.scrollHeight > el.clientHeight + 1);
  }, [resolved.description]);

  const titleNode = (
    <div className={styles.title} ref={titleRef}>
      {resolved.title}
    </div>
  );

  const descNode = resolved.description && (
    <div className={styles.description} ref={descRef}>
      {resolved.description}
    </div>
  );

  return (
    <div className="flex flex-col gap-0">
      {item.cover && <img alt="" className={styles.image} src={item.cover} />}
      <div className={cn('flex flex-col gap-1', styles.itemBody)}>
        {titleOverflow ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex">{titleNode}</span>} />
              <TooltipContent>{resolved.title}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          titleNode
        )}
        {descNode &&
          (descOverflow ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex">{descNode}</span>} />
                <TooltipContent>{resolved.description}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            descNode
          ))}
        {action ? (
          <Button
            className={cn('w-full', styles.action)}
            size="normal"
            variant="default"
            onClick={handleActionClick}
          >
            {resolved.linkLabel ?? t('billboard.learnMore')}
          </Button>
        ) : (
          item.linkUrl && (
            <a
              href={item.linkUrl}
              rel="noopener noreferrer"
              target="_blank"
              className={cn(
                buttonVariants({ variant: 'default', size: 'normal' }),
                styles.action,
                'w-full',
              )}
              onClick={handleLinkClick}
            >
              {resolved.linkLabel ?? t('billboard.learnMore')}
            </a>
          )
        )}
      </div>
    </div>
  );
});

ItemContent.displayName = 'BillboardItemContent';

const BILLBOARD_IMPRESSION_STORAGE_PREFIX = 'billboard:impression:';

const BillboardCarousel = memo<BillboardCarouselProps>(
  ({ set, onClose, closing, exitTarget, onAnimationFinish, cardAttr }) => {
    const { t: tCommon } = useTranslation('common');
    const [paused, setPaused] = useState(false);
    const [current, setCurrent] = useState(0);
    const [carouselApi, setCarouselApi] = useState<CarouselApi>();
    const autoplay = useSingleton(() =>
      Autoplay({ delay: 6000, stopOnFocusIn: false, stopOnInteraction: false }),
    );
    const [slideHeight, setSlideHeight] = useState<number>();
    const { analytics } = useAnalytics();

    useEffect(() => {
      if (!analytics || set.items.length === 0) return;
      const key = `${BILLBOARD_IMPRESSION_STORAGE_PREFIX}${set.slug}`;
      try {
        if (globalThis.sessionStorage?.getItem(key) === '1') return;
        globalThis.sessionStorage?.setItem(key, '1');
      } catch {
        // ignore storage access errors (e.g. private mode) and still report
      }
      void analytics.track({
        name: 'billboard_served',
        properties: {
          billboard_slug: set.slug,
          item_count: set.items.length,
          spm: 'billboard.card.served',
        },
      });
    }, [analytics, set.slug, set.items.length]);

    useEffect(() => {
      if (!carouselApi) return;
      let observed: Element | null = null;
      const resizeObserver = new ResizeObserver(() => {
        const slide = carouselApi.slideNodes()[carouselApi.selectedScrollSnap()];
        if (slide) setSlideHeight(slide.offsetHeight);
      });
      const sync = () => {
        const idx = carouselApi.selectedScrollSnap();
        setCurrent(idx);
        const slide = carouselApi.slideNodes()[idx];
        if (slide !== observed) {
          if (observed) resizeObserver.unobserve(observed);
          if (slide) resizeObserver.observe(slide);
          observed = slide;
        }
        if (slide) setSlideHeight(slide.offsetHeight);
      };
      sync();
      carouselApi.on('select', sync);
      carouselApi.on('reInit', sync);
      return () => {
        resizeObserver.disconnect();
        carouselApi.off('select', sync);
        carouselApi.off('reInit', sync);
      };
    }, [carouselApi]);

    useEffect(() => {
      if (paused) {
        autoplay.stop();
      } else {
        autoplay.play();
      }
    }, [autoplay, paused]);

    if (set.items.length === 0) return null;

    const single = set.items.length === 1;

    const cardDataProps = cardAttr ? { [cardAttr]: '' } : {};

    return (
      <m.div
        {...cardDataProps}
        className={styles.card}
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        animate={
          closing
            ? { opacity: 0, scale: 0.15, x: exitTarget?.x ?? 0, y: exitTarget?.y ?? 40 }
            : { opacity: 1, scale: 1, x: 0, y: 0 }
        }
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onAnimationComplete={() => {
          if (closing) onAnimationFinish?.();
        }}
      >
        <Button
          aria-label={tCommon('close')}
          className={styles.closeButton}
          size="icon"
          type="button"
          variant="ghost"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
        {single ? (
          <ItemContent
            billboardSlug={set.slug}
            item={set.items[0]}
            position={0}
            onClose={onClose}
          />
        ) : (
          <>
            <Carousel
              opts={{ align: 'start', loop: true }}
              plugins={[autoplay]}
              setApi={setCarouselApi}
            >
              <CarouselContent
                className="items-start"
                viewportClassName="transition-[height] duration-(--orvilo-motion-mid) ease-[ease]"
                viewportStyle={{ height: slideHeight }}
              >
                {set.items.map((item, idx) => (
                  <CarouselItem key={item.id}>
                    <ItemContent
                      billboardSlug={set.slug}
                      item={item}
                      position={idx}
                      onClose={onClose}
                    />
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
            <div className={cn('flex gap-1.5 justify-center', styles.dots)}>
              {set.items.map((item, idx) => (
                <Button
                  {...clickableProps()}
                  aria-current={current === idx || undefined}
                  aria-label={`${idx + 1} / ${set.items.length}`}
                  className={CLICKABLE_FOCUS_RING}
                  key={item.id}
                  size="icon"
                  type="button"
                  variant="ghost"
                  onClick={() => carouselApi?.scrollTo(idx)}
                >
                  <span
                    aria-hidden="true"
                    className={cn(styles.dot, current === idx ? styles.dotActive : '')}
                  />
                </Button>
              ))}
            </div>
          </>
        )}
      </m.div>
    );
  },
);

BillboardCarousel.displayName = 'BillboardCarousel';

export default BillboardCarousel;
