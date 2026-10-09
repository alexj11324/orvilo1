'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import Autoplay from 'embla-carousel-autoplay';
import { X } from 'lucide-react';
import * as m from 'motion/react-m';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
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

const styles = createStaticStyles(({ css }) => ({
  action: css`
    display: block;
    width: 100%;
    margin-block-start: 8px;
  `,
  card: css`
    position: fixed;
    z-index: 1000;
    inset-block-end: 56px;
    inset-inline-start: 8px;
    transform-origin: bottom left;

    overflow: hidden;
    display: flex;
    flex-direction: column;

    width: 300px;
    max-width: calc(100vw - 32px);
    padding: 0;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 12px;

    background: ${cssVar.colorBgContainer};
    box-shadow: 0 4px 24px rgb(0 0 0 / 12%);
  `,
  closeButton: css`
    position: absolute;
    z-index: 10;
    inset-block-start: 8px;
    inset-inline-end: 8px;

    /* Sits over the cover image (140px band) — give it its own opaque surface so
       the icon reads on any image, and lift z-index above the carousel dots /
       slick internals. */
    color: #fff;

    background: rgb(0 0 0 / 45%);
    backdrop-filter: blur(4px);

    &:hover {
      color: #fff;
      background: rgb(0 0 0 / 60%);
    }
  `,
  description: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;

    font-size: 14px;
    color: ${cssVar.colorTextSecondary};
    text-overflow: ellipsis;
  `,
  dot: css`
    cursor: pointer;

    width: 6px;
    height: 6px;
    border-radius: 50%;

    background: ${cssVar.colorFillSecondary};

    transition: all 0.2s;
  `,
  dotActive: css`
    width: 18px;
    border-radius: 3px;
    background: ${cssVar.colorPrimary};
  `,
  dots: css`
    padding-block-end: 10px;
  `,
  image: css`
    display: block;

    width: 100%;
    height: 140px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    object-fit: cover;
  `,
  itemBody: css`
    padding: 12px;
  `,
  title: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;

    font-size: 16px;
    font-weight: 600;
    color: ${cssVar.colorText};
    text-overflow: ellipsis;
  `,
}));

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
              <TooltipTrigger
                render={<span style={{ display: 'inline-flex' }}>{titleNode}</span>}
              />
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
                <TooltipTrigger
                  render={<span style={{ display: 'inline-flex' }}>{descNode}</span>}
                />
                <TooltipContent>{resolved.description}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            descNode
          ))}
        {action ? (
          <Button
            className={cn('w-full', styles.action)}
            variant="default"
            onClick={handleActionClick}
          >
            {resolved.linkLabel ?? t('billboard.learnMore')}
          </Button>
        ) : (
          item.linkUrl && (
            <a
              className={cn(buttonVariants({ variant: 'default' }), styles.action, 'w-full')}
              href={item.linkUrl}
              rel="noopener noreferrer"
              target="_blank"
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
        transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
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
        <ActionIcon
          aria-label={tCommon('close')}
          className={styles.closeButton}
          icon={X}
          size={14}
          onClick={onClose}
        />
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
                viewportStyle={{
                  height: slideHeight,
                  transition: 'height 0.3s ease',
                }}
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
                <div
                  {...clickableProps()}
                  aria-current={current === idx || undefined}
                  aria-label={`${idx + 1} / ${set.items.length}`}
                  key={item.id}
                  className={cn(
                    `${styles.dot} ${current === idx ? styles.dotActive : ''}`,
                    CLICKABLE_FOCUS_RING,
                  )}
                  onClick={() => carouselApi?.scrollTo(idx)}
                />
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
