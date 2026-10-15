'use client';

import { downloadFile } from '@orvilo/utils/client';
import { cn } from 'cn';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Ellipsis,
  FlipHorizontal,
  FlipVertical,
  ImageOff,
  Maximize,
  RotateCcw,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { getFileDownloadUrl } from '@/features/EditorCanvas/fileDownload';
import { useSingleton } from '@/hooks/useSingleton';

import type { Size, Transform } from './geometry';
import {
  anchoredZoom,
  boundPan,
  clampScale,
  fitImage,
  galleryIndex,
  initialScale,
} from './geometry';
import type { GalleryEntry } from './types';

/** Decode to PNG because browser clipboard image support is narrower than image rendering. */
async function clipboardImage(source: string) {
  const response = await fetch(source, { mode: 'cors' });
  if (!response.ok) throw new Error('Image response failed');
  const blob = await response.blob();
  if (blob.type === 'image/png') return blob;
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = objectUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image copy unavailable');
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (png) => (png ? resolve(png) : reject(new Error('Image conversion failed'))),
        'image/png',
      ),
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function sourceName(source: string) {
  try {
    return decodeURIComponent(
      new URL(source, window.location.href).pathname.split('/').pop() || 'image',
    );
  } catch {
    return 'image';
  }
}

export function ImageViewer({
  entries,
  initialIndex,
  opener,
  onClose,
}: {
  entries: GalleryEntry[];
  initialIndex: number;
  onClose: () => void;
  opener: HTMLElement;
}) {
  const { t, i18n } = useTranslation('common');
  const direction = i18n.dir();
  const [open, setOpen] = useState(true);
  const popupRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(initialIndex);
  const current = entries[index];
  const [busy, setBusy] = useState<'copy' | 'download'>();
  const [notice, setNotice] = useState<string>();
  const canCopy =
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard?.write &&
    typeof ClipboardItem !== 'undefined';
  const download = async () => {
    if (busy) return;
    setBusy('download');
    setNotice(undefined);
    try {
      if (current.options.onDownload) await current.options.onDownload(current.source);
      else {
        const proxy = getFileDownloadUrl(current.source, { appOrigin: window.location.origin });
        if (proxy !== current.source) window.open(proxy, '_blank', 'noopener,noreferrer');
        else {
          try {
            await downloadFile(current.source, sourceName(current.source), false);
          } catch {
            window.open(current.source, '_blank', 'noopener,noreferrer');
          }
        }
      }
      setNotice(t('imagePreview.downloadSuccess'));
    } catch {
      setNotice(t('imagePreview.downloadFailed'));
    } finally {
      setBusy(undefined);
    }
  };
  const copy = async () => {
    if (busy) return;
    setBusy('copy');
    setNotice(undefined);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': await clipboardImage(current.source) }),
      ]);
      setNotice(t('imagePreview.copySuccess'));
    } catch {
      setNotice(t('imagePreview.copyFailed'));
    } finally {
      setBusy(undefined);
    }
  };
  const navigate = (direction: number) => {
    setNotice(undefined);
    setIndex((value) => galleryIndex(value + direction, entries.length));
  };
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent
        className="h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none"
        dir={direction}
        finalFocus={() => (opener.isConnected ? opener : true)}
        ref={popupRef}
        showCloseButton={false}
        initialFocus={() =>
          popupRef.current?.querySelector<HTMLElement>('[data-image-viewport]') ?? true
        }
      >
        <DialogTitle className="sr-only">
          {current.element.alt || sourceName(current.source)}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {index + 1} / {entries.length}
        </DialogDescription>
        <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
          {entries.length > 1 && (
            <span
              aria-live="polite"
              className="rounded-(--radius-chip) bg-popover px-2 py-1 text-xs"
            >
              {index + 1} / {entries.length}
            </span>
          )}
          <Button
            aria-label={t('close')}
            size="icon"
            variant="secondary"
            onClick={() => setOpen(false)}
          >
            <X />
          </Button>
        </div>
        <ViewerCanvas
          busy={busy}
          canCopy={canCopy}
          direction={direction}
          entry={current}
          key={current.id}
          onCopy={copy}
          onDownload={download}
          onNext={entries.length > 1 ? () => navigate(1) : undefined}
          onPrevious={entries.length > 1 ? () => navigate(-1) : undefined}
        />
        {notice && (
          <div
            aria-live="polite"
            className="absolute top-2 left-2 z-10 max-w-1/2 rounded-(--radius-chip) bg-popover px-2 py-1 text-xs"
            role="status"
          >
            {notice}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ViewerCanvas({
  entry,
  onNext,
  onPrevious,
  onCopy,
  onDownload,
  busy,
  canCopy,
  direction,
}: {
  busy?: 'copy' | 'download';
  canCopy: boolean;
  direction: 'ltr' | 'rtl';
  entry: GalleryEntry;
  onCopy: () => Promise<void>;
  onDownload: () => Promise<void>;
  onNext?: () => void;
  onPrevious?: () => void;
}) {
  const { t } = useTranslation('common');
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pointers = useSingleton(() => new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | {
        allowSwipe: boolean;
        distance?: number;
        midpoint?: { x: number; y: number };
        start: { x: number; y: number };
        transform: Transform;
      }
    | undefined
  >(undefined);
  const [natural, setNatural] = useState<Size>({ height: 0, width: 0 });
  const [viewport, setViewport] = useState<Size>({ height: 0, width: 0 });
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [flip, setFlip] = useState({ x: 1, y: 1 });
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const initialized = useRef(false);
  // Stable geometry prevents the clamping effect from retriggering after its own state update.
  const fit = useMemo(() => fitImage(natural, viewport, rotation), [natural, viewport, rotation]);
  const maxScale = Math.max(1, entry.options.maxScale ?? 8);
  const actual = fit.ratio > 0 ? 1 / fit.ratio : 1;
  const ready = natural.width > 0 && fit.ratio > 0;
  const wheelState = useRef({ fit, maxScale, ready, rotation, viewport });
  wheelState.current = { fit, maxScale, ready, rotation, viewport };

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const resize = () => setViewport({ height: element.clientHeight, width: element.clientWidth });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth)
      setNatural({ height: image.naturalHeight, width: image.naturalWidth });
  }, [retry]);
  useEffect(() => {
    if (!ready) return;
    if (!initialized.current) {
      initialized.current = true;
      setTransform({
        scale: clampScale(
          initialScale(
            entry.options.defaultZoom ?? 'auto',
            fit.ratio,
            entry.options.autoZoomThreshold,
          ),
          maxScale,
        ),
        x: 0,
        y: 0,
      });
    } else setTransform((current) => boundPan(current, fit, viewport, rotation));
  }, [
    ready,
    fit,
    viewport,
    rotation,
    maxScale,
    entry.options.autoZoomThreshold,
    entry.options.defaultZoom,
  ]);

  // React delegates wheel listeners as passive; this owner must cancel page scroll while zooming.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      const current = wheelState.current;
      if (!current.ready) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const anchor = {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2,
      };
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? current.viewport.height : 1);
      setTransform((previous) =>
        boundPan(
          anchoredZoom(
            previous,
            clampScale(previous.scale * Math.exp(-delta * 0.002), current.maxScale),
            anchor,
          ),
          current.fit,
          current.viewport,
          current.rotation,
        ),
      );
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);

  const zoom = (scale: number, anchor = { x: 0, y: 0 }) =>
    setTransform((current) =>
      boundPan(anchoredZoom(current, clampScale(scale, maxScale), anchor), fit, viewport, rotation),
    );
  const reset = () => {
    setRotation(0);
    setFlip({ x: 1, y: 1 });
    setTransform({ scale: 1, x: 0, y: 0 });
  };
  const actualSize = () => zoom(transform.scale > 1 ? 1 : actual);
  const point = (event: { clientX: number; clientY: number }) => {
    const rect = viewportRef.current!.getBoundingClientRect();
    return {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2,
    };
  };
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-4 pt-12">
      <div
        data-image-viewport
        ref={viewportRef}
        tabIndex={0}
        className={cn(
          'relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden rounded-(--radius-card) bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring',
          transform.scale > 1 && 'cursor-grab active:cursor-grabbing',
        )}
        onDoubleClick={(event) => {
          if (ready) zoom(transform.scale > 1 ? 1 : Math.max(2, actual), point(event));
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            const move =
              (event.key === 'ArrowRight') === (direction === 'ltr') ? onNext : onPrevious;
            if (move) {
              event.preventDefault();
              move();
            }
          } else if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            zoom(transform.scale * 1.2);
          } else if (event.key === '-') {
            event.preventDefault();
            zoom(transform.scale / 1.2);
          } else if (event.key === '0') {
            event.preventDefault();
            reset();
          }
        }}
        onLostPointerCapture={(event) => {
          if (pointers.delete(event.pointerId)) gesture.current = undefined;
        }}
        onPointerCancel={(event) => {
          pointers.delete(event.pointerId);
          gesture.current = undefined;
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || !ready) return;
          const position = point(event);
          pointers.set(event.pointerId, position);
          event.currentTarget.setPointerCapture(event.pointerId);
          const points = [...pointers.values()];
          gesture.current = {
            allowSwipe: points.length === 1,
            start: position,
            transform,
            ...(points.length === 2
              ? {
                  distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
                  midpoint: {
                    x: (points[0].x + points[1].x) / 2,
                    y: (points[0].y + points[1].y) / 2,
                  },
                }
              : {}),
          };
        }}
        onPointerMove={(event) => {
          const start = gesture.current;
          if (!start || !pointers.has(event.pointerId)) return;
          const position = point(event);
          pointers.set(event.pointerId, position);
          const points = [...pointers.values()];
          if (points.length === 2 && start.distance && start.midpoint) {
            const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
            const midpoint = {
              x: (points[0].x + points[1].x) / 2,
              y: (points[0].y + points[1].y) / 2,
            };
            const next = anchoredZoom(
              start.transform,
              clampScale((start.transform.scale * distance) / start.distance, maxScale),
              start.midpoint,
            );
            setTransform(
              boundPan(
                {
                  ...next,
                  x: next.x + midpoint.x - start.midpoint.x,
                  y: next.y + midpoint.y - start.midpoint.y,
                },
                fit,
                viewport,
                rotation,
              ),
            );
          } else if (points.length === 1 && transform.scale > 1)
            setTransform(
              boundPan(
                {
                  ...start.transform,
                  x: start.transform.x + position.x - start.start.x,
                  y: start.transform.y + position.y - start.start.y,
                },
                fit,
                viewport,
                rotation,
              ),
            );
        }}
        onPointerUp={(event) => {
          const start = gesture.current;
          const end = point(event);
          if (
            pointers.size === 1 &&
            start?.allowSwipe &&
            start.transform.scale === 1 &&
            Math.abs(end.x - start.start.x) > 48 &&
            Math.abs(end.y - start.start.y) < 48
          ) {
            if (end.x < start.start.x === (direction === 'ltr')) onNext?.();
            else onPrevious?.();
          }
          pointers.delete(event.pointerId);
          const remaining = [...pointers.values()];
          gesture.current =
            remaining.length === 1
              ? { allowSwipe: false, start: remaining[0], transform }
              : undefined;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      >
        <img
          alt={entry.element.alt}
          draggable={false}
          key={retry}
          ref={imageRef}
          src={entry.source}
          className={cn(
            'pointer-events-none max-h-none max-w-none shrink-0 select-none',
            (!ready || failed) && 'invisible',
          )}
          style={{
            height: fit.height || undefined,
            width: fit.width || undefined,
            transform: `translate(${transform.x}px, ${transform.y}px) rotate(${rotation}deg) scale(${transform.scale * flip.x}, ${transform.scale * flip.y})`,
          }}
          onError={() => setFailed(true)}
          onLoad={(event) => {
            setFailed(false);
            setNatural({
              height: event.currentTarget.naturalHeight,
              width: event.currentTarget.naturalWidth,
            });
          }}
        />
        {!ready && !failed && <Spinner aria-label={t('loading')} className="absolute" />}
        {failed && (
          <div className="absolute flex flex-col items-center gap-2 text-muted-foreground">
            <ImageOff />
            <span className="text-sm">{t('error')}</span>
            <Button
              size="normal"
              variant="outline"
              onClick={() => {
                setFailed(false);
                setNatural({ height: 0, width: 0 });
                initialized.current = false;
                setRetry((value) => value + 1);
              }}
            >
              {t('retry')}
            </Button>
          </div>
        )}
        {onPrevious && (
          <Button
            aria-label={t('previous')}
            className="absolute start-2"
            size="icon"
            variant="secondary"
            onClick={onPrevious}
          >
            <ChevronLeft className="rtl:-scale-x-100" />
          </Button>
        )}
        {onNext && (
          <Button
            aria-label={t('next')}
            className="absolute end-2"
            size="icon"
            variant="secondary"
            onClick={onNext}
          >
            <ChevronRight className="rtl:-scale-x-100" />
          </Button>
        )}
      </div>
      <div
        aria-label={t('more')}
        className="flex flex-none flex-wrap items-center justify-center gap-2"
        role="toolbar"
      >
        <Button
          aria-label={t('imagePreview.zoomOut')}
          disabled={!ready || transform.scale <= 1}
          size="icon"
          variant="ghost"
          onClick={() => zoom(transform.scale / 1.2)}
        >
          <ZoomOut />
        </Button>
        <span className="w-14 text-center text-xs tabular-nums">
          {ready ? Math.round(transform.scale * fit.ratio * 100) : 0}%
        </span>
        <Button
          aria-label={t('imagePreview.zoomIn')}
          disabled={!ready || transform.scale >= maxScale}
          size="icon"
          variant="ghost"
          onClick={() => zoom(transform.scale * 1.2)}
        >
          <ZoomIn />
        </Button>
        <Button
          disabled={!ready}
          size="icon"
          variant="ghost"
          aria-label={t(
            transform.scale > 1 ? 'imagePreview.fitToScreen' : 'imagePreview.actualSize',
          )}
          onClick={actualSize}
        >
          <Maximize />
        </Button>
        <Button
          aria-label={t('download')}
          disabled={!!busy}
          loading={busy === 'download'}
          size="icon"
          variant="ghost"
          onClick={onDownload}
        >
          <Download />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button aria-label={t('more')} size="icon" variant="ghost" />}
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              disabled={!ready}
              onClick={() => setFlip((value) => ({ ...value, x: -value.x }))}
            >
              <FlipHorizontal />
              {t('imagePreview.flipHorizontal')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!ready}
              onClick={() => setFlip((value) => ({ ...value, y: -value.y }))}
            >
              <FlipVertical />
              {t('imagePreview.flipVertical')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!ready}
              onClick={() => setRotation((value) => (value + 270) % 360)}
            >
              <RotateCcw />
              {t('imagePreview.rotateLeft')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!ready}
              onClick={() => setRotation((value) => (value + 90) % 360)}
            >
              <RotateCw />
              {t('imagePreview.rotateRight')}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canCopy || !!busy} onClick={onCopy}>
              {busy === 'copy' ? <Spinner /> : <Copy />}
              {t('copy')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {entry.options.toolbarAddon}
      </div>
    </div>
  );
}
