'use client';

import { cn } from 'cn';
import { Check, MessageSquare, X } from 'lucide-react';
import { memo, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Image } from '@/components/ImagePreview';
import { Button } from '@/components/ui/button';

import type { EvidenceOverlay } from './overlay';
import {
  annotationInSlice,
  isPortraitScreenshot,
  screenshotSliceObjectPosition,
  screenshotSlices,
  screenshotTileWidth,
} from './screenshotSlices';

const styles = {
  // Use a 20px semantic metadata plate inside a 2px author-colour rim.
  badge:
    'absolute -inset-bs-3 -start-3 inline-flex size-6 items-center justify-center rounded-full',
  badgeLabel:
    'inline-flex size-5 items-center justify-center rounded-full bg-background text-xs font-semibold leading-5 text-foreground',
  frame:
    'relative max-w-full flex-none overflow-hidden rounded-(--radius-card) border border-divider',
  frameFlat: 'rounded-none border-0',
  // Compact32 keeps the -1px block-start and inline-end centre.
  marker:
    'pointer-events-auto absolute -inset-bs-4.25 -end-4.25 cursor-pointer rounded-full border border-background p-0 ring-1 ring-foreground shadow-(--shadow-raised) hover:ring-2',
  markerActive: 'outline-2 outline-solid outline-background outline-offset-2',
  note: 'absolute end-3 z-5 w-[min(280px,76%)] rounded-(--radius-overlay) bg-popover p-4 pe-12 shadow-(--shadow-popover) [@media(width>=1440px)]:start-[calc(100%+12px)] [@media(width>=1440px)]:end-auto [@media(width>=1440px)]:w-60',
  noteClose:
    'absolute inset-bs-2 end-2 border-0 bg-transparent p-0 text-foreground-tertiary hover:bg-accent hover:text-foreground',
  noteFallbackHead: 'pbe-1',
  // Compact32 surrounds the identity avatar; centre remains 2px outside the stage edge.
  pin: 'absolute -end-4.5 z-4 cursor-pointer rounded-full border border-background p-0 ring-1 ring-foreground shadow-(--shadow-raised) hover:ring-2 [@media(width>=1440px)]:start-[calc(100%+8px)] [@media(width>=1440px)]:end-auto',
  pinFace: 'size-4.5 rounded-full object-cover',
  pinInitial:
    'inline-flex size-5 items-center justify-center rounded-full bg-background text-xs font-semibold leading-5 text-foreground',
  stage: 'relative',
  noteBody: 'text-sm leading-5.5 whitespace-pre-wrap [overflow-wrap:anywhere]',
  // Authored regions sit on unknown screenshot pixels, independently of the app theme.
  rect: 'pointer-events-none absolute rounded-(--radius-chip) border-2 border-destructive shadow-[0_0_0_1px_var(--foreground),inset_0_0_0_1px_var(--background)]',
  swatch: 'size-2 flex-none rounded-full',
} as const;

interface OverlayRectProps {
  annotation: EvidenceOverlay;
  /** Index within the whole image, so the marker and the note agree. */
  index: number;
  numbered: boolean;
  onToggle: (index: number) => void;
  opened: boolean;
  /** Region geometry for THIS tile — a sliced screenshot clips it per tile. */
  rect: EvidenceOverlay['rect'];
}

const OverlayRect = memo<OverlayRectProps>(
  ({ annotation, index, numbered, onToggle, opened, rect }) => {
    // A settled region keeps its place but drops its author's colour: an
    // answered note should not compete with an open one for attention.
    const color = annotation.resolved
      ? 'var(--foreground-quaternary)'
      : (annotation.color ?? 'var(--destructive)');
    const label = annotation.label ?? index + 1;
    return (
      <div
        className={styles.rect}
        style={{
          borderColor: color,
          height: `${rect.height * 100}%`,
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.width * 100}%`,
        }}
      >
        {numbered && (
          <span className={styles.badge} style={{ background: color }}>
            <span className={styles.badgeLabel}>{label}</span>
          </span>
        )}
        {annotation.comment && (
          <Button
            className={cn(styles.marker, opened && styles.markerActive)}
            size="icon"
            style={{ background: color }}
            title={annotation.authorName}
            type={'button'}
            variant="ghost"
            onClick={() => onToggle(index)}
          >
            {annotation.resolved ? (
              <Check className="size-4 rounded-full bg-background text-foreground" size={16} />
            ) : (
              <AnnotationFace
                name={annotation.authorName}
                size={14}
                src={annotation.authorAvatar}
              />
            )}
          </Button>
        )}
      </div>
    );
  },
);

OverlayRect.displayName = 'AcceptanceOverlayRect';

/**
 * The author inside a pin. An avatar when we have one, their initial when we
 * do not, and the speech bubble only when the author is unknown — a pin with
 * no face is indistinguishable from the next pin along.
 */
const AnnotationFace = memo<{ name?: string; size?: number; src?: string | null }>(
  ({ name, size = 18, src }) => {
    if (src)
      return (
        <img
          alt={name ?? ''}
          className={styles.pinFace}
          src={src}
          style={{ height: size, width: size }}
        />
      );
    const initial = name?.trim().slice(0, 1);
    if (initial) return <span className={styles.pinInitial}>{initial.toUpperCase()}</span>;
    return (
      <MessageSquare className="size-4 rounded-full bg-background text-foreground" size={16} />
    );
  },
);

AnnotationFace.displayName = 'AcceptanceAnnotationFace';

interface ScreenshotTilesProps {
  alt: string;
  annotations?: EvidenceOverlay[];
  caption?: ReactNode;
  fileHeight?: number | null;
  fileWidth?: number | null;
  /** The surrounding comparison card already frames the screenshot. */
  flat?: boolean;
  src: string;
}

export const ScreenshotTiles = memo<ScreenshotTilesProps>(
  ({ alt, annotations, caption, fileHeight, fileWidth, flat = false, src }) => {
    const { t } = useTranslation('verify');
    const [natural, setNatural] = useState(
      fileWidth && fileHeight ? { height: fileHeight, width: fileWidth } : undefined,
    );
    const [openedNote, setOpenedNote] = useState<number>();

    const slices = natural ? screenshotSlices(natural.width, natural.height) : undefined;
    const numbered =
      (annotations?.length ?? 0) > 1 || annotations?.some((item) => item.label !== undefined);
    const toggleNote = (index: number) =>
      setOpenedNote((current) => (current === index ? undefined : index));
    const opened = openedNote === undefined ? undefined : annotations?.[openedNote];

    const rememberSize = (event: { currentTarget: HTMLImageElement }) => {
      if (natural) return;
      setNatural({
        height: event.currentTarget.naturalHeight,
        width: event.currentTarget.naturalWidth,
      });
    };

    // Pinned near the region it belongs to, but never so low that the panel
    // hangs off the bottom of the image.
    const note = opened && (
      <div
        className={styles.note}
        style={{ insetBlockStart: `${Math.min(Math.max(opened.rect.y, 0), 0.62) * 100}%` }}
      >
        {/*
         * Opening a note hides every pin, including the one that opened it, so
         * without this the only way back is the small marker on the box itself
         * — findable if you know it is there, and nowhere near where the reader
         * is looking.
         */}
        <Button
          className={styles.noteClose}
          size="icon"
          title={t('acceptance.comments.collapseThread')}
          type={'button'}
          variant="ghost"
          onClick={() => setOpenedNote(undefined)}
        >
          <X className="size-4" size={16} />
        </Button>
        {opened.panel ?? (
          <div className="flex flex-col gap-1">
            <div className={`flex items-center gap-1.5 ${styles.noteFallbackHead}`}>
              <span
                className={styles.swatch}
                style={{ background: opened.color ?? 'var(--destructive)' }}
              />
              <div className="text-xs leading-5 text-muted-foreground">
                {numbered ? `${opened.label ?? openedNote! + 1} · ` : ''}
                {opened.authorName}
              </div>
            </div>
            <div className={styles.noteBody}>{opened.comment}</div>
          </div>
        )}
      </div>
    );

    const pins =
      openedNote === undefined &&
      annotations?.map((annotation, index) =>
        annotation.comment ? (
          <Button
            className={styles.pin}
            key={index}
            size="icon"
            title={annotation.authorName}
            type={'button'}
            variant="ghost"
            style={{
              background: annotation.resolved
                ? 'var(--foreground-quaternary)'
                : (annotation.color ?? 'var(--destructive)'),
              insetBlockStart: `${Math.min(Math.max(annotation.rect.y, 0), 0.86) * 100}%`,
            }}
            onClick={() => toggleNote(index)}
          >
            {annotation.resolved ? (
              <Check className="size-4 rounded-full bg-background text-foreground" size={16} />
            ) : (
              <AnnotationFace name={annotation.authorName} src={annotation.authorAvatar} />
            )}
          </Button>
        ) : null,
      );

    const shell = (width: string | number, body: ReactNode) => (
      <div className="flex flex-col gap-1" style={{ maxWidth: '100%', width }}>
        <div className={styles.stage}>
          {body}
          {pins}
          {note}
        </div>
        {caption}
      </div>
    );

    if (!natural) {
      return shell(
        '100%',
        <div
          className={cn(styles.frame, flat && styles.frameFlat)}
          style={{ maxWidth: '100%', width: '100%' }}
        >
          <Image
            alt={alt}
            loading={'lazy'}
            src={src}
            style={flat ? { borderRadius: 0 } : undefined}
            variant={'borderless'}
            width={'100%'}
            onLoad={rememberSize}
          />
        </div>,
      );
    }

    if (slices) {
      return shell(
        '100%',
        <div className="flex items-start gap-3 flex-wrap">
          {slices.map((slice) => {
            const local = annotations
              ?.map((annotation, index) => {
                const rect = annotationInSlice(annotation.rect, slice, natural.height);
                if (!rect) return;
                return { annotation, index, rect };
              })
              .filter((item) => item !== undefined);

            return (
              <div
                className={cn(styles.frame, flat && styles.frameFlat)}
                key={slice.index}
                style={{
                  aspectRatio: `${natural.width} / ${slice.height}`,
                  width: screenshotTileWidth(natural.width),
                }}
              >
                <Image
                  alt={alt}
                  height={'100%'}
                  loading={'lazy'}
                  maxHeight={'none'}
                  maxWidth={'none'}
                  objectFit={'cover'}
                  src={src}
                  style={{ borderRadius: flat ? 0 : undefined, height: '100%', width: '100%' }}
                  variant={'borderless'}
                  width={'100%'}
                  styles={{
                    image: {
                      height: '100%',
                      objectPosition: screenshotSliceObjectPosition(slice, natural.height),
                      width: '100%',
                    },
                    wrapper: { height: '100%', width: '100%' },
                  }}
                />
                {local?.map((item) => (
                  <OverlayRect
                    annotation={item.annotation}
                    index={item.index}
                    key={item.index}
                    numbered={Boolean(numbered)}
                    opened={openedNote === item.index}
                    rect={item.rect}
                    onToggle={toggleNote}
                  />
                ))}
              </div>
            );
          })}
        </div>,
      );
    }

    const portrait = isPortraitScreenshot(natural.width, natural.height);

    return shell(
      portrait ? screenshotTileWidth(natural.width) : '100%',
      <div
        className={cn(styles.frame, flat && styles.frameFlat)}
        style={{
          aspectRatio: `${natural.width} / ${natural.height}`,
          maxWidth: '100%',
          width: '100%',
        }}
      >
        <Image
          alt={alt}
          loading={'lazy'}
          maxHeight={'none'}
          maxWidth={'none'}
          objectFit={'contain'}
          src={src}
          style={{ borderRadius: flat ? 0 : undefined, width: '100%' }}
          variant={'borderless'}
          width={'100%'}
        />
        {annotations?.map((annotation, index) => (
          <OverlayRect
            annotation={annotation}
            index={index}
            key={index}
            numbered={Boolean(numbered)}
            opened={openedNote === index}
            rect={annotation.rect}
            onToggle={toggleNote}
          />
        ))}
      </div>,
    );
  },
);

ScreenshotTiles.displayName = 'AcceptanceScreenshotTiles';
