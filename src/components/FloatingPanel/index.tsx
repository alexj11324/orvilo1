'use client';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { cn } from 'cn';
import { X } from 'lucide-react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'react-responsive';

import { Button } from '@/components/ui/button';
import { Dialog, DialogPortal } from '@/components/ui/dialog';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

import { type Handle, type Placement, resizeHandles, resizePanel } from './geometry';
import { ToastDodge } from './ToastDodge';

type Part =
  | 'wrapper'
  | 'panel'
  | 'backdrop'
  | 'header'
  | 'title'
  | 'actions'
  | 'close'
  | 'body'
  | 'footer'
  | 'resizeHandle';
type Size = { width: number; height: number };
export interface FloatingPanelProps {
  actions?: ReactNode;
  afterClose?: () => void;
  ariaLabel?: string;
  children?: ReactNode;
  className?: string;
  classNames?: Partial<Record<Part, string>>;
  closable?: boolean;
  closeIcon?: ReactNode;
  closeLabel?: string;
  defaultOpen?: boolean;
  footer?: ReactNode;
  getContainer?: false | HTMLElement | null;
  height?: number | string;
  keyboard?: boolean;
  mask?: boolean;
  maskClosable?: boolean;
  maxHeight?: number;
  maxWidth?: number;
  minHeight?: number;
  minWidth?: number;
  modal?: boolean;
  offset?: number | string | { x?: number | string; y?: number | string };
  onClose?: () => void;
  onOpenChange?: DialogPrimitive.Root.Props['onOpenChange'];
  onResize?: (size: Size) => void;
  onResizeEnd?: (size: Size) => void;
  open?: boolean;
  placement?: Placement;
  resizable?: boolean;
  styles?: Partial<Record<Part, CSSProperties>>;
  title?: ReactNode;
  width?: number | string;
  zIndex?: number;
}
const handleClasses: Record<Handle, string> = {
  top: 'inset-x-4 -top-1 h-2 cursor-ns-resize',
  bottom: 'inset-x-4 -bottom-1 h-2 cursor-ns-resize',
  left: 'inset-y-4 -start-1 w-2 cursor-ew-resize',
  right: 'inset-y-4 -end-1 w-2 cursor-ew-resize',
  topLeft: '-top-1.25 -start-1.25 size-4 cursor-nwse-resize',
  topRight: '-top-1.25 -end-1.25 size-4 cursor-nesw-resize',
  bottomLeft: '-bottom-1.25 -start-1.25 size-4 cursor-nesw-resize',
  bottomRight: '-bottom-1.25 -end-1.25 size-4 cursor-nwse-resize',
};
export function FloatingPanel({
  actions,
  afterClose,
  ariaLabel,
  children,
  className,
  classNames,
  closable = true,
  closeIcon,
  closeLabel,
  defaultOpen,
  footer,
  getContainer,
  height,
  keyboard = true,
  mask = false,
  maskClosable = true,
  maxHeight,
  maxWidth,
  minHeight = 180,
  minWidth = 320,
  modal = false,
  offset = 8,
  onClose,
  onOpenChange,
  onResize,
  onResizeEnd,
  open,
  placement = 'bottomRight',
  resizable = true,
  styles,
  title,
  width = 640,
  zIndex,
}: FloatingPanelProps) {
  const { t } = useTranslation('common');
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const reducedMotion = useMediaQuery({ query: '(prefers-reduced-motion: reduce)' });
  const motion = animationMode !== 'disabled' && !reducedMotion;
  const [size, setSize] = useState<
    Size & { sourceWidth: typeof width; sourceHeight: typeof height }
  >();
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    handle: Handle;
    latest?: Size;
  } | null>(null);
  useEffect(
    () => () => {
      drag.current = null;
    },
    [],
  );
  const current = size?.sourceWidth === width && size.sourceHeight === height ? size : undefined;
  const top = placement.startsWith('top');
  const left = placement.endsWith('Left');
  const resolved =
    typeof offset === 'object' ? { x: offset.x ?? 8, y: offset.y ?? 8 } : { x: offset, y: offset };
  const px = (value: number | string) => (typeof value === 'number' ? `${value}px` : value);
  const blockInset = `calc(${px(resolved.y)} + var(--floating-panel-reserve-block-end, 0px))`;
  const inlineInset = `calc(${px(resolved.x)} + var(--floating-panel-reserve-inline-end, 0px))`;
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || event.pointerId !== start.id) return;
    const next = resizePanel({
      handle: start.handle,
      width: start.width,
      height: start.height,
      deltaX: event.clientX - start.x,
      deltaY: event.clientY - start.y,
      minWidth,
      minHeight,
      maxWidth: maxWidth ?? Math.max(320, window.innerWidth - 16),
      maxHeight: maxHeight ?? Math.max(180, window.innerHeight - 16),
    });
    start.latest = next;
    setSize({ ...next, sourceWidth: width, sourceHeight: height });
    onResize?.(next);
  };
  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    const latest = drag.current.latest;
    drag.current = null;
    if (latest) onResizeEnd?.(latest);
  };
  const content = (
    <>
      {mask && (
        <DialogPrimitive.Backdrop
          className={cn('fixed inset-0 bg-black/10', classNames?.backdrop)}
          style={{ zIndex, ...styles?.backdrop }}
        />
      )}
      <div
        className={cn(
          'pointer-events-none fixed inset-0 flex overflow-hidden',
          motion &&
            'transition-[padding-block-start,padding-block-end,padding-inline-start,padding-inline-end] duration-200 motion-reduce:transition-none',
          classNames?.wrapper,
        )}
        style={{
          alignItems: top ? 'flex-start' : 'flex-end',
          justifyContent: left ? 'flex-start' : 'flex-end',
          paddingBlockStart: top ? blockInset : undefined,
          paddingBlockEnd: top ? undefined : blockInset,
          paddingInlineStart: left ? inlineInset : undefined,
          paddingInlineEnd: left ? undefined : inlineInset,
          zIndex,
          ...styles?.wrapper,
        }}
      >
        <DialogPrimitive.Popup
          aria-label={ariaLabel}
          className={cn(
            'pointer-events-auto relative flex min-h-0 flex-col rounded-(--radius-overlay) bg-card text-foreground shadow-(--shadow-popover) ring-1 ring-border outline-none',
            motion &&
              'transition-[opacity,transform] duration-200 data-ending-style:opacity-0 data-ending-style:duration-140 data-starting-style:opacity-0 data-starting-style:scale-98 data-ending-style:scale-98 motion-reduce:transition-none',
            className,
            classNames?.panel,
          )}
          style={{
            height: current?.height ?? height,
            width: current?.width ?? width,
            minHeight,
            minWidth,
            maxWidth: 'calc(100dvw - 32px)',
            maxHeight: 'calc(100dvh - 32px - var(--floating-panel-reserve-block-end, 0px))',
            transformOrigin: top ? '100% 0' : '100% 100%',
            ...styles?.panel,
          }}
        >
          {placement === 'bottomRight' && <ToastDodge />}
          {resizable &&
            resizeHandles(placement).map((handle) => (
              <div
                aria-hidden
                data-floating-panel-resize-handle={handle}
                key={handle}
                style={styles?.resizeHandle}
                className={cn(
                  'absolute z-10 touch-none',
                  handleClasses[handle],
                  classNames?.resizeHandle,
                )}
                onLostPointerCapture={end}
                onPointerCancel={end}
                onPointerMove={move}
                onPointerUp={end}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const rect = event.currentTarget.parentElement?.getBoundingClientRect();
                  if (!rect) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  drag.current = {
                    id: event.pointerId,
                    x: event.clientX,
                    y: event.clientY,
                    width: rect.width,
                    height: rect.height,
                    handle,
                  };
                }}
              />
            ))}
          {(title !== undefined || actions !== undefined || closable) && (
            <div
              style={styles?.header}
              className={cn(
                'flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-divider px-3',
                classNames?.header,
              )}
            >
              {title !== undefined ? (
                <DialogPrimitive.Title
                  className={cn('min-w-0 flex-1 truncate text-sm', classNames?.title)}
                  style={styles?.title}
                >
                  {title}
                </DialogPrimitive.Title>
              ) : (
                <span />
              )}
              <div className="flex shrink-0 items-center gap-1">
                {actions && (
                  <div
                    className={cn('flex shrink-0 items-center gap-1', classNames?.actions)}
                    style={styles?.actions}
                  >
                    {actions}
                  </div>
                )}
                {closable && (
                  <DialogPrimitive.Close
                    aria-label={closeLabel ?? t('close')}
                    render={
                      <Button
                        className={classNames?.close}
                        size="compact"
                        style={styles?.close}
                        variant="ghost"
                      />
                    }
                  >
                    {closeIcon ?? <X size={16} />}
                  </DialogPrimitive.Close>
                )}
              </div>
            </div>
          )}
          <div
            className={cn('min-h-0 flex-1 overflow-x-hidden overflow-y-auto', classNames?.body)}
            style={styles?.body}
          >
            {children}
          </div>
          {footer && (
            <div
              className={cn('shrink-0 border-t border-divider', classNames?.footer)}
              style={styles?.footer}
            >
              {footer}
            </div>
          )}
        </DialogPrimitive.Popup>
      </div>
    </>
  );
  return (
    <Dialog
      defaultOpen={defaultOpen}
      modal={modal}
      open={open}
      onOpenChange={(value, details) => {
        if (
          !value &&
          ((!keyboard && details.reason === 'escape-key') ||
            (!maskClosable &&
              (details.reason === 'outside-press' || details.reason === 'focus-out')))
        ) {
          details.cancel();
          return;
        }
        if (!value) onClose?.();
        onOpenChange?.(value, details);
      }}
      onOpenChangeComplete={(value) => {
        if (!value) afterClose?.();
      }}
    >
      {getContainer === false ? (
        content
      ) : (
        <DialogPortal container={getContainer ?? undefined}>{content}</DialogPortal>
      )}
    </Dialog>
  );
}
export default FloatingPanel;
