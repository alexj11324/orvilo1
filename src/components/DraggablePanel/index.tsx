'use client';

import { cn } from 'cn';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import type { ComponentProps, CSSProperties, KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Props as RndProps, Rnd } from 'react-rnd';

import { Button } from '@/components/ui/button';

import { type PanelDelta, type PanelPlacement, type PanelSize, resolvePanelResize } from './size';

export interface DraggablePanelProps extends Omit<ComponentProps<'aside'>, 'onResize' | 'ref'> {
  backgroundColor?: string;
  classNames?: { content?: string; handle?: string };
  collapseThreshold?: number;
  defaultExpand?: boolean;
  defaultSize?: PanelSize;
  destroyOnClose?: boolean;
  expand?: boolean;
  expandable?: boolean;
  fullscreen?: boolean;
  headerHeight?: number;
  maxHeight?: number;
  maxWidth?: number;
  minHeight?: number;
  minWidth?: number;
  mode?: 'fixed' | 'float';
  onExpandChange?: (expand: boolean) => void;
  onSizeChange?: (delta: PanelDelta, size?: PanelSize) => void;
  onSizeDragging?: (delta: PanelDelta, size?: PanelSize) => void;
  pin?: boolean;
  placement: PanelPlacement;
  resize?: RndProps['enableResizing'];
  showBorder?: boolean;
  showHandleHighlight?: boolean;
  showHandleWhenCollapsed?: boolean;
  showHandleWideArea?: boolean;
  size?: PanelSize;
  stableLayout?: boolean;
  styles?: { content?: CSSProperties; handle?: CSSProperties };
}

const opposite = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' } as const;
const arrows = { left: ChevronRight, right: ChevronLeft, top: ChevronDown, bottom: ChevronUp };
const borders = { left: 'border-r', right: 'border-l', top: 'border-b', bottom: 'border-t' };
const anchors = { left: 'left-0', right: 'right-0', top: 'top-0', bottom: 'bottom-0' };
const toggles = {
  left: 'right-0 top-1/2',
  right: 'left-0 top-1/2',
  top: 'bottom-0 left-1/2',
  bottom: 'top-0 left-1/2',
};

export function DraggablePanel({
  backgroundColor,
  children,
  className,
  classNames,
  collapseThreshold,
  defaultExpand = true,
  defaultSize,
  destroyOnClose,
  dir,
  expand,
  expandable = true,
  fullscreen,
  headerHeight = 0,
  maxHeight,
  maxWidth,
  minHeight,
  minWidth,
  mode = 'fixed',
  onExpandChange,
  onSizeChange,
  onSizeDragging,
  pin = true,
  placement,
  resize,
  showBorder = true,
  showHandleHighlight,
  showHandleWhenCollapsed,
  showHandleWideArea = true,
  size,
  stableLayout = true,
  styles,
  style,
  ...props
}: DraggablePanelProps) {
  const { t, i18n } = useTranslation('common');
  const direction = dir ?? i18n.dir();
  const side =
    direction === 'rtl' && (placement === 'left' || placement === 'right')
      ? opposite[placement]
      : placement;
  const vertical = side === 'top' || side === 'bottom';
  const initialSize: PanelSize = {
    width: vertical ? '100%' : 280,
    height: vertical ? 180 : '100%',
    ...defaultSize,
  };
  const [internalExpand, setInternalExpand] = useState(defaultExpand);
  const [internalSize, setInternalSize] = useState(initialSize);
  const [dragSize, setDragSize] = useState<PanelSize>();
  const [collapsePreview, setCollapsePreview] = useState(false);
  const open = expand ?? internalExpand;
  const renderedSize = dragSize ?? { ...internalSize, ...size };
  const activeSize = {
    width: renderedSize.width ?? initialSize.width ?? (vertical ? '100%' : 280),
    height: renderedSize.height ?? initialSize.height ?? (vertical ? 180 : '100%'),
  };
  const content = useRef<HTMLDivElement>(null);
  const startSize = useRef<PanelSize | undefined>(undefined);
  const originalSize = useRef<PanelSize | undefined>(undefined);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const min = vertical ? minHeight : minWidth;
  const max = vertical ? maxHeight : maxWidth;
  const resizable = resize !== false && open;
  const changeExpand = (value: boolean) => {
    if (expand === undefined) setInternalExpand(value);
    onExpandChange?.(value);
  };
  const measured = () => {
    const rect = content.current?.getBoundingClientRect();
    return rect ? { width: rect.width, height: rect.height } : undefined;
  };
  useEffect(() => {
    originalSize.current = undefined;
  }, [side]);
  useEffect(() => {
    if (open && !originalSize.current) {
      const value = measured();
      if (value)
        originalSize.current = vertical
          ? { height: value.height, width: '100%' }
          : { width: value.width, height: '100%' };
    }
  }, [open, side, vertical]);
  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    },
    [],
  );

  const commitSize = (next: PanelSize, delta: PanelDelta) => {
    setInternalSize(next);
    onSizeChange?.(delta, next);
  };
  const resetSize = () => {
    if (!resizable || !originalSize.current) return;
    const old = measured();
    const next = originalSize.current;
    commitSize(next, {
      width: typeof next.width === 'number' ? next.width - (old?.width ?? next.width) : 0,
      height: typeof next.height === 'number' ? next.height - (old?.height ?? next.height) : 0,
    });
  };
  const keyboardResize = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!resizable) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      resetSize();
      return;
    }
    const current = measured();
    if (!current) return;
    const amount = event.shiftKey ? 32 : 8;
    const positive =
      side === 'left'
        ? 'ArrowRight'
        : side === 'right'
          ? 'ArrowLeft'
          : side === 'top'
            ? 'ArrowDown'
            : 'ArrowUp';
    const negative =
      side === 'left'
        ? 'ArrowLeft'
        : side === 'right'
          ? 'ArrowRight'
          : side === 'top'
            ? 'ArrowUp'
            : 'ArrowDown';
    let difference = event.key === positive ? amount : event.key === negative ? -amount : undefined;
    if (event.key === 'Home' && min !== undefined)
      difference = min - (vertical ? current.height : current.width);
    if (event.key === 'End' && max !== undefined)
      difference = max - (vertical ? current.height : current.width);
    if (difference === undefined) return;
    event.preventDefault();
    const raw = {
      ...current,
      [vertical ? 'height' : 'width']: (vertical ? current.height : current.width) + difference,
    };
    const next = resolvePanelResize(raw, vertical, min, max, collapseThreshold);
    if (next.collapse) changeExpand(false);
    else
      commitSize(next.size, {
        width: vertical ? 0 : Number(next.size.width) - current.width,
        height: vertical ? Number(next.size.height) - current.height : 0,
      });
  };
  const handle = (
    <div
      aria-label={t('resizePanel')}
      aria-orientation={vertical ? 'horizontal' : 'vertical'}
      aria-valuemax={max}
      aria-valuemin={min ?? 0}
      role="separator"
      style={styles?.handle}
      tabIndex={0}
      aria-valuenow={
        typeof activeSize[vertical ? 'height' : 'width'] === 'number'
          ? Number(activeSize[vertical ? 'height' : 'width'])
          : undefined
      }
      className={cn(
        'h-full w-full touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        showHandleHighlight && 'hover:bg-selected',
        classNames?.handle,
      )}
      onDoubleClick={resetSize}
      onKeyDown={keyboardResize}
    />
  );
  const defaults = {
    top: false,
    right: false,
    bottom: false,
    left: false,
    topRight: false,
    bottomRight: false,
    bottomLeft: false,
    topLeft: false,
  };
  const resizing = resizable
    ? { ...defaults, [opposite[side]]: true, ...(typeof resize === 'object' ? resize : {}) }
    : false;
  const dimension = !open || collapsePreview ? 0 : activeSize[vertical ? 'height' : 'width'];
  const outerStyle: CSSProperties = {
    ...(vertical ? { height: dimension } : { width: dimension }),
    ...(mode === 'float' && !vertical
      ? { top: headerHeight, height: `calc(100% - ${headerHeight}px)` }
      : {}),
    ...style,
  };
  const Arrow = arrows[side];
  if (fullscreen)
    return (
      <div
        className={cn('fixed inset-0 z-50 flex min-h-0 min-w-0 flex-col bg-card', className)}
        {...props}
      >
        {children}
      </div>
    );
  return (
    <aside
      dir={direction}
      style={outerStyle}
      className={cn(
        'min-h-0 min-w-0 shrink-0',
        !dragSize &&
          'transition-[width,height] duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-out) motion-reduce:transition-none',
        mode === 'float' ? 'absolute z-20' : 'relative',
        anchors[side],
        vertical ? 'w-full' : 'h-full',
        showBorder && open && ['border-divider', borders[side]],
        className,
      )}
      onMouseEnter={() => {
        if (leaveTimer.current) clearTimeout(leaveTimer.current);
        if (!pin && !open) changeExpand(true);
      }}
      onMouseLeave={() => {
        if (!pin && open) leaveTimer.current = setTimeout(() => changeExpand(false), 150);
      }}
      {...props}
    >
      <div
        className={cn(
          'h-full w-full overflow-hidden',
          !dragSize &&
            'transition-[width,height] duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-out) motion-reduce:transition-none',
        )}
      >
        {(!destroyOnClose || open) && (
          <Rnd
            disableDragging
            className={cn('!relative flex min-h-0 min-w-0 flex-col bg-card', classNames?.content)}
            enableResizing={resizing}
            maxHeight={maxHeight}
            maxWidth={maxWidth}
            minHeight={minHeight}
            minWidth={minWidth}
            position={{ x: 0, y: 0 }}
            resizeHandleComponent={{ [opposite[side]]: handle }}
            style={{ ...(backgroundColor ? { backgroundColor } : {}), ...styles?.content }}
            size={
              stableLayout || collapseThreshold !== undefined
                ? activeSize
                : {
                    ...activeSize,
                    [vertical ? 'height' : 'width']: open
                      ? activeSize[vertical ? 'height' : 'width']
                      : 0,
                  }
            }
            onResize={(_event, _direction, element, delta) => {
              const rect = element.getBoundingClientRect();
              const next = resolvePanelResize(rect, vertical, min, max, collapseThreshold);
              setDragSize(next.size);
              setCollapsePreview(next.collapse);
              onSizeDragging?.(delta, next.size);
            }}
            onResizeStart={(event) => {
              if ('detail' in event && event.detail === 2) {
                resetSize();
                return false;
              }
              const current = measured();
              startSize.current = current
                ? { width: current.width, height: current.height }
                : activeSize;
            }}
            onResizeStop={(_event, _direction, element, delta) => {
              const next = resolvePanelResize(
                element.getBoundingClientRect(),
                vertical,
                min,
                max,
                collapseThreshold,
              );
              const committed = next.collapse ? (startSize.current ?? activeSize) : next.size;
              setDragSize(undefined);
              setCollapsePreview(false);
              startSize.current = undefined;
              commitSize(committed, delta);
              if (next.collapse) changeExpand(false);
            }}
          >
            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col" ref={content}>
              {children}
            </div>
          </Rnd>
        )}
      </div>
      {expandable && !dragSize && (open || showHandleWhenCollapsed) && (
        <Button
          aria-expanded={open}
          aria-label={t('toggle')}
          size="icon-sm"
          variant="ghost"
          className={cn(
            'absolute z-10',
            toggles[side],
            showHandleWideArea && 'shadow-(--shadow-raised)',
          )}
          onClick={() => changeExpand(!open)}
        >
          <Arrow className={open ? 'rotate-180' : undefined} />
        </Button>
      )}
    </aside>
  );
}

export default DraggablePanel;
