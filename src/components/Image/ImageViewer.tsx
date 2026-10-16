'use client';

import { Dialog } from '@base-ui/react/dialog';
import { cn } from 'cn';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  type KeyboardEvent,
  type PointerEvent,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  type WheelEvent,
} from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { toast } from '@/components/toast';
import { downloadFile } from '@/utils/client/downloadFile';

import {
  fitScale,
  scaleBounds,
  type Size,
  type ViewTransform,
  wheelFactor,
  wrapIndex,
  ZOOM_STEP,
  zoomAt,
} from './geometry';
import type { ImagePreviewOptions } from './PreviewGroup';

export interface ViewerItem {
  options: ImagePreviewOptions;
  src: string;
}

interface ImageViewerProps {
  initialIndex: number;
  items: ViewerItem[];
  onClose: () => void;
}

const DEFAULT_MAX_SCALE = 8;
// Round viewer controls: middle (36/20) and large (44/24) ActionIcon sizes.
const ROUND = { blockSize: 36, borderRadius: '9999px', size: 20 };
const ROUND_LARGE = { blockSize: 44, borderRadius: '9999px', size: 24 };
const DRAG_THRESHOLD = 3;

const fileNameFromUrl = (url: string) => {
  try {
    const name = new URL(url, location.href).pathname.split('/').at(-1);
    return name ? decodeURIComponent(name) : 'image';
  } catch {
    return 'image';
  }
};

const readViewport = (): Size =>
  typeof window === 'undefined'
    ? { height: 0, width: 0 }
    : { height: window.innerHeight, width: window.innerWidth };

const styles = {
  backdrop:
    'fixed inset-0 z-1250 bg-[color-mix(in_srgb,var(--background)_90%,transparent)] backdrop-blur-sm transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none',
  chrome:
    'pointer-events-auto bg-[color-mix(in_srgb,var(--background)_60%,transparent)] backdrop-blur-md',
  counter:
    'pointer-events-none absolute inset-bs-4 inset-s-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs tabular-nums text-muted-foreground',
  image:
    'absolute inset-s-1/2 inset-bs-1/2 max-w-none cursor-zoom-out select-none will-change-transform [-webkit-user-drag:none]',
  nav: 'absolute inset-bs-1/2 -translate-y-1/2',
  popup:
    'fixed inset-0 z-1250 overflow-hidden outline-none transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none',
  toolbar:
    'absolute inset-be-4 inset-s-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-1.5 py-1',
};

/**
 * Full-screen image lightbox: wheel or toolbar zoom anchored at the pointer,
 * drag to pan, rotate, download, and arrow-key navigation through a gallery.
 * Escape or a click on the image or backdrop closes it.
 */
const ImageViewer = ({ initialIndex, items, onClose }: ImageViewerProps) => {
  const { t } = useTranslation('ui');
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(initialIndex);
  const [natural, setNatural] = useState<Size>({ height: 0, width: 0 });
  const [viewport, setViewport] = useState(readViewport);
  const [rotation, setRotation] = useState(0);
  const [view, setView] = useState<ViewTransform | null>(null);
  const [downloading, setDownloading] = useState(false);
  const panRef = useRef<{ moved: boolean; origin: ViewTransform; x: number; y: number } | null>(
    null,
  );

  const item = items[index];
  const source = item?.options.src || item?.src || '';
  const fit = fitScale(natural, viewport, rotation);
  const bounds = scaleBounds(fit, item?.options.maxScale ?? DEFAULT_MAX_SCALE);
  const current = view ?? { scale: fit, x: 0, y: 0 };
  const hasGallery = items.length > 1;

  useEffect(() => {
    const onResize = () => setViewport(readViewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onOpenChange = item?.options.onOpenChange;
  useEffect(() => {
    onOpenChange?.(true);
    return () => onOpenChange?.(false);
  }, [onOpenChange]);

  const go = useCallback(
    (step: number) => {
      if (!hasGallery) return;
      setIndex((value) => wrapIndex(value + step, items.length));
      setNatural({ height: 0, width: 0 });
      setRotation(0);
      setView(null);
    },
    [hasGallery, items.length],
  );

  const zoomBy = (factor: number, anchor = { x: 0, y: 0 }) =>
    setView(zoomAt(current, factor, anchor, bounds));

  const toggleActualSize = () =>
    setView(Math.abs(current.scale - 1) < 0.01 ? null : { scale: 1, x: 0, y: 0 });

  const rotate = (step: number) => {
    setRotation((value) => value + step);
    setView(null);
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await (item.options.onDownload ?? ((src) => downloadFile(src, fileNameFromUrl(src))))(source);
    } catch {
      toast.error(t('image.downloadFailed'));
    } finally {
      setDownloading(false);
    }
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    zoomBy(wheelFactor(event.deltaY), {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2,
    });
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    panRef.current = { moved: false, origin: current, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan) return;
    const dx = event.clientX - pan.x;
    const dy = event.clientY - pan.y;
    if (!pan.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    pan.moved = true;
    setView({ ...pan.origin, x: pan.origin.x + dx, y: pan.origin.y + dy });
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    panRef.current = null;
    if (pan && !pan.moved && !(event.target as HTMLElement).closest('button')) setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const actions: Record<string, () => void> = {
      '+': () => zoomBy(ZOOM_STEP),
      '-': () => zoomBy(1 / ZOOM_STEP),
      '0': () => setView(null),
      '=': () => zoomBy(ZOOM_STEP),
      'ArrowLeft': () => go(-1),
      'ArrowRight': () => go(1),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  const handleLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const { naturalHeight, naturalWidth } = event.currentTarget;
    setNatural({ height: naturalHeight, width: naturalWidth });
  };

  const percentage = Math.round(current.scale * 100);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup
          aria-label={t('image.preview')}
          className={styles.popup}
          onKeyDown={handleKeyDown}
        >
          <div
            className="absolute inset-0 touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
            onPointerCancel={() => {
              panRef.current = null;
            }}
          >
            {source && (
              <img
                alt=""
                className={styles.image}
                draggable={false}
                key={source}
                src={source}
                style={{
                  transform: `translate(-50%, -50%) translate(${current.x}px, ${current.y}px) scale(${current.scale}) rotate(${rotation}deg)`,
                  visibility: natural.width ? 'visible' : 'hidden',
                }}
                onLoad={handleLoad}
              />
            )}
          </div>

          <ActionIcon
            className={cn(styles.chrome, 'absolute inset-bs-4 inset-e-4')}
            icon={X}
            size={ROUND}
            title={t('image.close')}
            onClick={() => setOpen(false)}
          />

          {hasGallery && (
            <>
              <ActionIcon
                className={cn(styles.chrome, styles.nav, 'inset-s-4')}
                icon={ChevronLeft}
                size={ROUND_LARGE}
                title={t('image.prev')}
                onClick={() => go(-1)}
              />
              <ActionIcon
                className={cn(styles.chrome, styles.nav, 'inset-e-4')}
                icon={ChevronRight}
                size={ROUND_LARGE}
                title={t('image.next')}
                onClick={() => go(1)}
              />
              <div className={cn(styles.chrome, styles.counter)}>
                {index + 1} / {items.length}
              </div>
            </>
          )}

          <div className={cn(styles.chrome, styles.toolbar)}>
            <ActionIcon
              disabled={current.scale <= bounds.min}
              icon={ZoomOut}
              size={ROUND}
              title={t('image.zoomOut')}
              onClick={() => zoomBy(1 / ZOOM_STEP)}
            />
            <button
              className="h-9 w-14 cursor-pointer rounded-full border-0 bg-transparent text-xs tabular-nums text-foreground-tertiary hover:bg-accent"
              title={t('image.actualSize')}
              type="button"
              onClick={toggleActualSize}
            >
              {percentage}%
            </button>
            <ActionIcon
              disabled={current.scale >= bounds.max}
              icon={ZoomIn}
              size={ROUND}
              title={t('image.zoomIn')}
              onClick={() => zoomBy(ZOOM_STEP)}
            />
            <ActionIcon
              icon={RotateCcw}
              size={ROUND}
              title={t('image.rotateLeft')}
              onClick={() => rotate(-90)}
            />
            <ActionIcon
              icon={RotateCw}
              size={ROUND}
              title={t('image.rotateRight')}
              onClick={() => rotate(90)}
            />
            <ActionIcon
              icon={Download}
              loading={downloading}
              size={ROUND}
              title={t('image.download')}
              onClick={handleDownload}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default ImageViewer;
