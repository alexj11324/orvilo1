'use client';

import type { AcceptanceReviewAnnotation } from '@orvilo/types';
import { Trash2 } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { EvidenceOverlay } from './overlay';
import { useAnnotationGesture } from './useAnnotationGesture';

/**
 * Region-comment primitives for acceptance evidence images. Rects are stored
 * normalized (0–1) against the IMAGE box — never the surrounding frame. A
 * frame can silently grow wider than the image it holds (flex stretch, long
 * sibling text driving fit-content), and any rect normalized or rendered
 * against that bigger box lands visibly off the pixels the user circled.
 */

type Rect = AcceptanceReviewAnnotation['rect'];

const styles = {
  badge:
    'absolute -top-[9px] -start-[9px] inline-flex items-center justify-center size-[18px] rounded-[50%] text-[11px] font-semibold leading-none text-(--ant-color-text-light-solid) bg-destructive',
  badgeDelete:
    'cursor-pointer absolute -top-[9px] -end-[9px] inline-flex items-center justify-center size-[18px] border-none rounded-[50%] text-(--ant-color-text-light-solid) bg-destructive hover:brightness-[1.15] [@media(pointer:coarse)]:-top-3 [@media(pointer:coarse)]:-end-3 [@media(pointer:coarse)]:size-6',
  canvas: 'cursor-crosshair select-none',
  editableRect: 'pointer-events-auto cursor-move',
  frame:
    'relative overflow-hidden inline-block self-start w-fit max-w-full border border-sidebar-border rounded-(--ant-border-radius-lg)',
  image: 'block max-w-full',
  rect: 'absolute border-2 border-destructive rounded-[4px] shadow-[0_0_0_1px] shadow-black/45 inset-shadow-[0_0_0_1px] inset-shadow-white/45',
  resizeHandle:
    "cursor-nwse-resize absolute -bottom-1.5 -end-1.5 size-3 border-2 border-destructive rounded-[50%] bg-card after:content-[''] after:absolute after:-inset-4",
};

const rectStyle = (rect: Rect) => ({
  height: `${rect.height * 100}%`,
  left: `${rect.x * 100}%`,
  top: `${rect.y * 100}%`,
  width: `${rect.width * 100}%`,
});

interface AnnotatedImageProps {
  /**
   * Each region carries the colour of whoever drew it — see
   * {@link EvidenceOverlay}. `label` overrides the badge number: regions
   * belonging to one review may be spread across several images, and per-image
   * numbering would restart at 1 on each.
   */
  annotations: EvidenceOverlay[];
  imageStyle?: React.CSSProperties;
  /** Render the per-region notes under the image. Off when a caller already lists them. */
  showComments?: boolean;
  src: string;
}

/** An evidence image with its circled regions (read-only display). */
export const AnnotatedImage = memo<AnnotatedImageProps>(
  ({ annotations, imageStyle, showComments = true, src }) => {
    // A badge is noise on a single unnumbered region, but required as soon as
    // anything refers to a region by number.
    const numbered = annotations.length > 1 || annotations.some((item) => item.label !== undefined);

    return (
      <div className="flex flex-col gap-1.5" style={{ maxWidth: '100%', width: 'fit-content' }}>
        <div className={styles.frame}>
          <img alt={''} className={styles.image} src={src} style={imageStyle} />
          {annotations.map((annotation, index) => (
            <div
              className={styles.rect}
              key={index}
              style={{
                ...rectStyle(annotation.rect),
                borderColor: annotation.color ?? 'var(--destructive)',
              }}
            >
              {numbered && (
                <span
                  className={styles.badge}
                  style={{ background: annotation.color ?? 'var(--destructive)' }}
                >
                  {annotation.label ?? index + 1}
                </span>
              )}
            </div>
          ))}
        </div>
        {showComments && (
          <div className="flex flex-col gap-0.5">
            {annotations.map(
              (annotation, index) =>
                annotation.comment && (
                  <div className="text-[12px] text-muted-foreground" key={index}>
                    {numbered ? `${annotation.label ?? index + 1}. ` : ''}
                    {annotation.authorName ? `${annotation.authorName}: ` : ''}
                    {annotation.comment}
                  </div>
                ),
            )}
          </div>
        )}
      </div>
    );
  },
);

AnnotatedImage.displayName = 'AcceptanceAnnotatedImage';

export interface DraftAnnotation {
  comment: string;
  rect: Rect;
}

interface AnnotationCanvasProps {
  annotations: DraftAnnotation[];
  drawing?: boolean;
  /**
   * Explicit display width (CSS px) — the host computes viewport × zoom.
   * Rects are normalized to the image box, so zooming never remaps them; the
   * host's scroll container doubles as panning when zoomed in.
   */
  imageWidth?: number;
  onDraw: (rect: Rect) => void;
  onRemove: (index: number) => void;
  /** Reposition / resize an existing region. */
  onUpdate: (index: number, rect: Rect) => void;
  src: string;
}

/**
 * Drag on the image to circle a region; drag a region to move it, drag its
 * corner handle to resize; each region carries its own note.
 */
export const AnnotationCanvas = memo<AnnotationCanvasProps>(
  ({ annotations, drawing = true, imageWidth, onDraw, onRemove, onUpdate, src }) => {
    const { t: tCommon } = useTranslation('common');
    const { draft, handlers, imageRef, startEdit } = useAnnotationGesture({
      drawing,
      onDraw,
      onUpdate,
    });

    return (
      <div
        className={`${styles.frame} ${styles.canvas}`}
        // With an explicit zoomed width the frame must OUTGROW its host —
        // capping at 100% would clip the image instead of letting the host
        // viewport scroll/pan over it.
        style={{
          maxWidth: imageWidth ? 'none' : undefined,
          touchAction: drawing ? 'none' : 'pan-x pan-y',
          cursor: drawing ? 'crosshair' : 'auto',
        }}
        {...handlers}
      >
        <img
          alt={''}
          className={styles.image}
          draggable={false}
          ref={imageRef}
          src={src}
          // Zoomed width comes from the host (viewport × zoom); the frame
          // shrink-wraps the image, so overlays track exactly.
          style={imageWidth ? { maxWidth: 'none', width: imageWidth } : undefined}
        />
        {annotations.map((annotation, index) => (
          <div
            className={`${styles.rect} ${styles.editableRect}`}
            key={index}
            style={{ ...rectStyle(annotation.rect), pointerEvents: drawing ? 'auto' : 'none' }}
            onPointerDown={(event) => startEdit(event, index, annotation.rect, 'move')}
          >
            <span className={styles.badge}>{index + 1}</span>
            <button
              aria-label={tCommon('remove')}
              className={styles.badgeDelete}
              type={'button'}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onRemove(index);
              }}
            >
              <Trash2 size={11} />
            </button>
            <span
              className={styles.resizeHandle}
              onPointerDown={(event) => startEdit(event, index, annotation.rect, 'resize')}
            />
          </div>
        ))}
        {draft && <div className={styles.rect} style={rectStyle(draft)} />}
      </div>
    );
  },
);

AnnotationCanvas.displayName = 'AcceptanceAnnotationCanvas';
