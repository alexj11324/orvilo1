'use client';

import { cn } from 'cn';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { clamp, dampenValue, findClosestSnapPoint, getSnapRelease, resolveSize } from './helpers';
import { useSheetDrag } from './useSheetDrag';

const ANIMATION_MS = 300;

export interface FloatingSheetProps {
  /** Controlled snap point (one of `snapPoints`). */
  activeSnapPoint?: number;
  children?: ReactNode;
  className?: string;
  /** Fraction of the lowest snap point below which a release dismisses the sheet. */
  closeThreshold?: number;
  defaultOpen?: boolean;
  dismissible?: boolean;
  headerActions?: ReactNode;
  /** Pixels, or a fraction of the parent height when `<= 1`. */
  maxHeight?: number;
  /** Pixels, or a fraction of the parent height when `<= 1`. */
  minHeight?: number;
  /** `overlay` pins the sheet to the parent's bottom; `inline` grows upward in flow. */
  mode?: 'inline' | 'overlay';
  onOpenChange?: (open: boolean) => void;
  onSnapPointChange?: (snapPoint: number) => void;
  open?: boolean;
  restingHeight?: number;
  snapPoints?: number[];
  title?: ReactNode;
  variant?: 'elevated' | 'embedded';
  width?: number | string;
}

/** A bottom sheet resized by dragging its header between snap points. */
const FloatingSheet = ({
  activeSnapPoint,
  children,
  className,
  closeThreshold = 0.25,
  defaultOpen = false,
  dismissible = true,
  headerActions,
  maxHeight = 0.8,
  minHeight = 200,
  mode = 'overlay',
  onOpenChange,
  onSnapPointChange,
  open: openProp,
  restingHeight: restingHeightProp,
  snapPoints,
  title,
  variant = 'elevated',
  width = '100%',
}: FloatingSheetProps) => {
  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = isControlled ? openProp : internalOpen;
  const setOpen = useCallback(
    (value: boolean) => {
      if (!isControlled) setInternalOpen(value);
      onOpenChange?.(value);
    },
    [isControlled, onOpenChange],
  );

  const sheetRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const parent = sheetRef.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerHeight(entry.contentRect.height);
    });
    observer.observe(parent);
    setContainerHeight(parent.getBoundingClientRect().height);
    return () => observer.disconnect();
  }, []);

  const minHeightPx = resolveSize(minHeight, containerHeight);
  const maxHeightPx = resolveSize(maxHeight, containerHeight);
  const restingHeightPx =
    restingHeightProp === undefined
      ? minHeightPx
      : clamp(resolveSize(restingHeightProp, containerHeight), minHeightPx, maxHeightPx);

  const hasSnapPoints = !!snapPoints && snapPoints.length > 0;
  const snapPointHeights = useMemo(() => {
    if (!containerHeight || !snapPoints) return [];
    const resolved = snapPoints
      .map((point) => clamp(resolveSize(point, containerHeight), minHeightPx, maxHeightPx))
      .sort((a, b) => a - b);
    return [...new Set(resolved)];
  }, [snapPoints, containerHeight, minHeightPx, maxHeightPx]);

  let restingHeight = restingHeightPx;
  if (!containerHeight) restingHeight = 0;
  else if (hasSnapPoints && activeSnapPoint !== undefined)
    restingHeight = clamp(resolveSize(activeSnapPoint, containerHeight), minHeightPx, maxHeightPx);
  else if (hasSnapPoints && snapPointHeights.length > 0) restingHeight = snapPointHeights[0];

  const [height, setHeight] = useState(isOpen ? restingHeight : 0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const heightBeforeDrag = useRef(0);
  const prevOpenRef = useRef(isOpen);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = isOpen;
    if (isOpen === wasOpen) return;

    setIsClosing(!isOpen);
    setIsAnimating(true);
    setHeight(isOpen ? restingHeight : 0);
    const timer = setTimeout(() => {
      setIsAnimating(false);
      setIsClosing(false);
    }, ANIMATION_MS);
    return () => clearTimeout(timer);
    // Only open/close transitions animate here; resting-height changes follow below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const dismiss = useCallback(() => {
    setIsClosing(true);
    setHeight(0);
    setTimeout(() => {
      setOpen(false);
      setIsAnimating(false);
      setIsClosing(false);
    }, ANIMATION_MS);
  }, [setOpen]);

  const { handleProps, isDragging } = useSheetDrag({
    enabled: isOpen,
    onDragChange: (draggedDistance) => {
      const next = heightBeforeDrag.current + draggedDistance;
      if (!hasSnapPoints) {
        setHeight(clamp(next, 0, maxHeightPx));
        return;
      }
      const highest = snapPointHeights.at(-1) ?? maxHeightPx;
      const lowest = snapPointHeights[0] ?? minHeightPx;
      if (next > highest) setHeight(highest + dampenValue(next - highest));
      else if (next < lowest) setHeight(Math.max(0, lowest - dampenValue(lowest - next)));
      else setHeight(next);
    },
    onDragEnd: (draggedDistance, velocity) => {
      setIsAnimating(true);
      const currentHeight = heightBeforeDrag.current + draggedDistance;

      if (hasSnapPoints) {
        const closest = findClosestSnapPoint(
          heightBeforeDrag.current,
          snapPointHeights,
          minHeightPx,
          maxHeightPx,
        );
        const release = getSnapRelease({
          activeIndex: snapPointHeights.indexOf(closest),
          closeThreshold,
          currentHeight,
          dismissible,
          draggedDistance,
          maxHeightPx,
          minHeightPx,
          snapPointHeights,
          velocity,
        });
        if (release.type === 'dismiss') return dismiss();

        setHeight(release.height);
        const snapPoint = snapPoints?.find(
          (point) =>
            clamp(resolveSize(point, containerHeight), minHeightPx, maxHeightPx) === release.height,
        );
        if (snapPoint !== undefined) onSnapPointChange?.(snapPoint);
      } else {
        if (dismissible && currentHeight < minHeightPx * closeThreshold) return dismiss();
        setHeight(clamp(currentHeight, minHeightPx, maxHeightPx));
      }

      setTimeout(() => setIsAnimating(false), ANIMATION_MS);
    },
  });

  useEffect(() => {
    if (isOpen && !isDragging) setHeight(restingHeight);
    // Follow a new resting height without fighting an in-progress drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restingHeight]);

  useEffect(() => {
    if (isDragging) heightBeforeDrag.current = height;
    // Capture the height once, at drag start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  const isVisible = isOpen || isClosing || height > 0;
  const overflowUp = mode === 'inline' && isVisible ? Math.max(0, height - restingHeightPx) : 0;

  return (
    <div
      data-floating-sheet=""
      data-state={isOpen ? 'open' : 'closed'}
      ref={sheetRef}
      className={cn(
        'flex flex-col overflow-hidden bg-card',
        variant === 'embedded'
          ? 'border border-divider shadow-none'
          : 'shadow-(--shadow-popover) ring-1 ring-foreground/10',
        mode === 'overlay'
          ? 'absolute inset-x-0 bottom-0 z-10 rounded-t-(--radius-overlay)'
          : 'relative z-1 shrink-0 rounded-(--radius-overlay)',
        !isDragging &&
          isAnimating &&
          'transition-[height,margin-block-start] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
        !isVisible && 'invisible',
        className,
      )}
      style={{
        height: isVisible ? height : 0,
        marginBlockStart: overflowUp ? -overflowUp : undefined,
        width,
      }}
    >
      <div
        className={cn(
          'flex shrink-0 cursor-grab flex-col items-center px-4 pt-2 pb-1 select-none',
          isDragging && 'cursor-grabbing',
        )}
        {...handleProps}
      >
        <div className="mb-2 h-1 w-8 rounded-full bg-divider" />
        <div className="flex min-h-6 w-full items-center justify-between">
          {title && <div className="min-w-0 flex-1">{title}</div>}
          {headerActions && (
            <div data-no-drag className="flex shrink-0 items-center gap-1">
              {headerActions}
            </div>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
};

export default FloatingSheet;
