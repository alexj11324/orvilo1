'use client';

import { Dialog } from '@base-ui/react/dialog';
import { cn } from 'cn';
import { t } from 'i18next';
import { XIcon } from 'lucide-react';
import {
  type CSSProperties,
  memo,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

type Placement = 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight';
type ResizeHandle =
  'bottom' | 'bottomLeft' | 'bottomRight' | 'left' | 'right' | 'top' | 'topLeft' | 'topRight';

export interface FloatingPanelProps {
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  closable?: boolean;
  height?: number | string;
  maxHeight?: number;
  maxWidth?: number;
  minHeight?: number;
  minWidth?: number;
  onClose?: () => void;
  open?: boolean;
  placement?: Placement;
  resizable?: boolean;
  styles?: { body?: CSSProperties; panel?: CSSProperties; title?: CSSProperties };
  title?: ReactNode;
  width?: number | string;
}

const OFFSET = 8;
const DEFAULT_MIN_HEIGHT = 180;
const DEFAULT_MIN_WIDTH = 320;

const RESIZE_HANDLES: Record<Placement, ResizeHandle[]> = {
  bottomLeft: ['top', 'right', 'topRight'],
  bottomRight: ['top', 'left', 'topLeft'],
  topLeft: ['bottom', 'right', 'bottomRight'],
  topRight: ['bottom', 'left', 'bottomLeft'],
};

const HANDLE_CLASSES: Record<ResizeHandle, string> = {
  bottom: '-bottom-1 inset-x-4 h-2 cursor-ns-resize after:inset-x-0 after:bottom-0.75 after:h-0.5',
  bottomLeft: '-bottom-1.25 -left-1.25 size-4 cursor-nesw-resize',
  bottomRight: '-right-1.25 -bottom-1.25 size-4 cursor-nwse-resize',
  left: 'inset-y-4 -left-1 w-2 cursor-ew-resize after:inset-y-0 after:left-0.75 after:w-0.5',
  right: 'inset-y-4 -right-1 w-2 cursor-ew-resize after:inset-y-0 after:right-0.75 after:w-0.5',
  top: '-top-1 inset-x-4 h-2 cursor-ns-resize after:inset-x-0 after:top-0.75 after:h-0.5',
  topLeft: '-top-1.25 -left-1.25 size-4 cursor-nwse-resize',
  topRight: '-top-1.25 -right-1.25 size-4 cursor-nesw-resize',
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

interface Size {
  height: number;
  width: number;
}

/**
 * A non-modal panel docked to a viewport corner, resizable from its inner
 * edges. Escape and outside presses close it through `onClose`.
 */
const FloatingPanel = memo<FloatingPanelProps>(
  ({
    actions,
    children,
    className,
    closable = true,
    height,
    maxHeight,
    maxWidth,
    minHeight = DEFAULT_MIN_HEIGHT,
    minWidth = DEFAULT_MIN_WIDTH,
    onClose,
    open,
    placement = 'bottomRight',
    resizable = true,
    styles,
    title,
    width = 640,
  }) => {
    const isTop = placement.startsWith('top');
    const isLeft = placement.endsWith('Left');
    // A manual resize applies until the caller changes the requested size.
    const [resized, setResized] = useState<Size & { source: string }>();
    const cleanupRef = useRef<() => void>(undefined);
    const sourceKey = `${width}|${height}`;
    const activeSize = resized?.source === sourceKey ? resized : undefined;

    useEffect(() => () => cleanupRef.current?.(), []);

    const startResize = useCallback(
      (handle: ResizeHandle) => (event: PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const panel = event.currentTarget.parentElement;
        if (!panel) return;

        const rect = panel.getBoundingClientRect();
        const maxW = Math.max(minWidth, maxWidth ?? window.innerWidth - 16);
        const maxH = Math.max(minHeight, maxHeight ?? window.innerHeight - 16);
        const startX = event.clientX;
        const startY = event.clientY;
        const growsLeft = handle === 'left' || handle.endsWith('Left');
        const growsRight = handle === 'right' || handle.endsWith('Right');
        const growsTop = handle.startsWith('top');
        const growsBottom = handle.startsWith('bottom');

        const onMove = (move: globalThis.PointerEvent) => {
          const dx = move.clientX - startX;
          const dy = move.clientY - startY;
          const nextWidth = growsLeft ? rect.width - dx : growsRight ? rect.width + dx : rect.width;
          const nextHeight = growsTop
            ? rect.height - dy
            : growsBottom
              ? rect.height + dy
              : rect.height;
          setResized({
            height: clamp(nextHeight, minHeight, maxH),
            source: sourceKey,
            width: clamp(nextWidth, minWidth, maxW),
          });
        };
        const onUp = () => {
          cleanupRef.current?.();
          cleanupRef.current = undefined;
        };

        cleanupRef.current?.();
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        cleanupRef.current = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };
      },
      [maxHeight, maxWidth, minHeight, minWidth, sourceKey],
    );

    const showHeader = title !== undefined || actions !== undefined || closable;

    return (
      <Dialog.Root
        modal={false}
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onClose?.();
        }}
      >
        <Dialog.Portal>
          <div
            style={{ padding: OFFSET }}
            className={cn(
              'pointer-events-none fixed inset-0 z-1200 flex',
              isTop ? 'items-start' : 'items-end',
              isLeft ? 'justify-start' : 'justify-end',
            )}
          >
            <Dialog.Popup
              className={cn(
                'pointer-events-auto relative flex max-h-[calc(100dvh-32px)] w-[calc(100dvw-32px)] flex-col overflow-visible rounded-(--radius-overlay) bg-popover text-sm text-popover-foreground shadow-(--shadow-popover) ring-1 ring-foreground/10 outline-none duration-200 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-98 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-98',
                isTop
                  ? 'origin-top-right data-open:slide-in-from-top-3 data-closed:slide-out-to-top-3'
                  : 'origin-bottom-right data-open:slide-in-from-bottom-3 data-closed:slide-out-to-bottom-3',
                className,
              )}
              style={{
                height: activeSize?.height ?? height,
                maxWidth: activeSize?.width ?? width,
                minHeight,
                minWidth,
                ...styles?.panel,
              }}
            >
              {resizable &&
                RESIZE_HANDLES[placement].map((handle) => (
                  <div
                    aria-hidden
                    data-floating-panel-resize-handle={handle}
                    key={handle}
                    className={cn(
                      'absolute z-1 touch-none bg-transparent after:absolute after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity hover:after:opacity-55',
                      HANDLE_CLASSES[handle],
                    )}
                    onPointerDown={startResize(handle)}
                  />
                ))}
              {showHeader && (
                <div className="flex min-h-12 flex-none items-center justify-between gap-2 border-b border-divider px-4 py-2">
                  {title === undefined ? (
                    <span />
                  ) : (
                    <Dialog.Title
                      className="m-0 min-w-0 flex-1 text-sm font-semibold text-foreground"
                      style={styles?.title}
                    >
                      {title}
                    </Dialog.Title>
                  )}
                  <div className="flex flex-none items-center gap-1">
                    {actions && <div className="flex flex-none items-center gap-1">{actions}</div>}
                    {closable && (
                      <Dialog.Close
                        aria-label={t('close', { ns: 'common' })}
                        className="-me-1 inline-flex size-8 cursor-pointer items-center justify-center rounded-(--radius-button) border-none bg-transparent p-0 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <XIcon size={16} />
                      </Dialog.Close>
                    )}
                  </div>
                </div>
              )}
              <div
                className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
                style={styles?.body}
              >
                {children}
              </div>
            </Dialog.Popup>
          </div>
        </Dialog.Portal>
      </Dialog.Root>
    );
  },
);

FloatingPanel.displayName = 'FloatingPanel';

export default FloatingPanel;
