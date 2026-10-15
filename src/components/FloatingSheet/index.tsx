'use client';

import { cn } from 'cn';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'react-responsive';

import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

import {
  clampSheetSize,
  closestSheetSnap,
  dampenSheetDrag,
  releaseSheetSnap,
  resolveSheetSize,
} from './snap';

export interface FloatingSheetProps {
  activeSnapPoint?: number;
  children?: ReactNode;
  className?: string;
  closeThreshold?: number;
  defaultOpen?: boolean;
  dismissible?: boolean;
  headerActions?: ReactNode;
  maxHeight?: number;
  minHeight?: number;
  mode?: 'overlay' | 'inline';
  onOpenChange?: (open: boolean) => void;
  onSnapPointChange?: (point: number) => void;
  open?: boolean;
  restingHeight?: number;
  snapPoints?: number[];
  title?: ReactNode;
  variant?: 'elevated' | 'embedded';
  width?: number | string;
}

export function FloatingSheet({
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
  open,
  restingHeight,
  snapPoints = [],
  title,
  variant = 'elevated',
  width = '100%',
}: FloatingSheetProps) {
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const reducedMotion = useMediaQuery({ query: '(prefers-reduced-motion: reduce)' });
  const motionEnabled = animationMode !== 'disabled' && !reducedMotion;
  const { t } = useTranslation('common');
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;
  const root = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [height, setHeight] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; y: number; start: number; time: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const minimum = resolveSheetSize(minHeight, containerHeight);
  const maximum = Math.max(minimum, resolveSheetSize(maxHeight, containerHeight));
  const points = [
    ...new Set(
      snapPoints.map((point) =>
        clampSheetSize(resolveSheetSize(point, containerHeight), minimum, maximum),
      ),
    ),
  ].sort((a, b) => a - b);
  const resting = clampSheetSize(
    resolveSheetSize(restingHeight ?? minHeight, containerHeight),
    minimum,
    maximum,
  );
  const active =
    activeSnapPoint !== undefined
      ? clampSheetSize(resolveSheetSize(activeSnapPoint, containerHeight), minimum, maximum)
      : (points[0] ?? resting);
  useEffect(() => {
    const parent = root.current?.parentElement;
    if (!parent) return;
    setContainerHeight(parent.getBoundingClientRect().height);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setContainerHeight(entry.contentRect.height);
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!drag.current) setHeight(isOpen ? active : 0);
  }, [isOpen, active]);
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );
  const changeOpen = (value: boolean) => {
    if (open === undefined) setInternalOpen(value);
    onOpenChange?.(value);
  };
  const finish = (next: number | null) => {
    if (next === null) {
      setHeight(0);
      if (closeTimer.current) clearTimeout(closeTimer.current);
      // Keep the public dismiss callback timing independent of visual motion preferences.
      closeTimer.current = setTimeout(() => {
        changeOpen(false);
        closeTimer.current = undefined;
      }, 300);
      return;
    }
    setHeight(next);
    const original = snapPoints.find(
      (point) =>
        clampSheetSize(resolveSheetSize(point, containerHeight), minimum, maximum) === next,
    );
    if (original !== undefined) onSnapPointChange?.(original);
  };
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (
      !isOpen ||
      event.button !== 0 ||
      (event.target instanceof Element &&
        event.target.closest('button, input, textarea, select, a, [data-no-drag]'))
    )
      return;
    event.preventDefault();
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id: event.pointerId,
      y: event.clientY,
      start: height,
      time: performance.now(),
    };
    setDragging(true);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    const raw = start.start + start.y - event.clientY;
    const low = points[0] ?? minimum;
    const high = points.at(-1) ?? maximum;
    setHeight(
      raw > high
        ? high + dampenSheetDrag(raw - high)
        : raw < low && !dismissible
          ? low - dampenSheetDrag(low - raw)
          : Math.max(0, raw),
    );
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    drag.current = null;
    const distance = start.y - event.clientY;
    const elapsed = performance.now() - start.time;
    const next = releaseSheetSnap({
      start: start.start,
      height: start.start + distance,
      distance,
      velocity: elapsed > 0 ? Math.abs(distance) / elapsed : 0,
      points,
      min: minimum,
      max: maximum,
      dismissible,
      closeThreshold,
    });
    setDragging(false);
    finish(next);
  };
  const cancel = () => {
    const start = drag.current;
    drag.current = null;
    setDragging(false);
    if (start) setHeight(start.start);
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || !isOpen) return;
    const choices = points.length ? points : [minimum, maximum];
    const index = choices.indexOf(closestSheetSnap(height, choices));
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      finish(
        choices[
          Math.max(0, Math.min(choices.length - 1, index + (event.key === 'ArrowUp' ? 1 : -1)))
        ],
      );
    } else if (event.key === 'Home') {
      event.preventDefault();
      finish(choices[0]);
    } else if (event.key === 'End') {
      event.preventDefault();
      finish(choices.at(-1)!);
    } else if (event.key === 'Escape' && dismissible) {
      event.preventDefault();
      finish(null);
    }
  };
  return (
    <div
      data-floating-sheet=""
      data-state={isOpen ? 'open' : 'closed'}
      inert={!isOpen && height === 0}
      ref={root}
      className={cn(
        'flex min-h-0 shrink-0 flex-col overflow-hidden bg-card text-foreground',
        mode === 'overlay' ? 'absolute bottom-0 rounded-t-(--radius-overlay)' : 'relative',
        variant === 'elevated' && 'shadow-(--shadow-popover)',
        !dragging &&
          motionEnabled &&
          'transition-[height,margin-top] duration-300 ease-(--orvilo-motion-ease-out) motion-reduce:transition-none',
        className,
      )}
      style={{
        height,
        marginTop: mode === 'inline' ? -Math.max(0, height - resting) : undefined,
        width,
      }}
    >
      <div
        aria-label={t('resizePanel')}
        aria-orientation="horizontal"
        aria-valuemax={maximum}
        aria-valuemin={minimum}
        aria-valuenow={height}
        className="flex min-h-9 shrink-0 touch-none items-center justify-between gap-2 border-b border-divider px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        role="separator"
        tabIndex={isOpen ? 0 : -1}
        onKeyDown={keyboard}
        onLostPointerCapture={cancel}
        onPointerCancel={cancel}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
      >
        <div className="min-w-0 flex-1 truncate">{title}</div>
        <div data-no-drag className="flex shrink-0 items-center gap-1">
          {headerActions}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
export default FloatingSheet;
