'use client';

import { cn } from 'cn';
import { useTransform } from 'motion/react';
import * as m from 'motion/react-m';
import {
  createContext,
  type CSSProperties,
  type HTMLAttributes,
  memo,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  AXES,
  coarsePointer,
  createPanelController,
  handleSize,
  type PanelController,
  type PanelOptions,
  type PanelState,
  type Placement,
  timing,
} from './controller';
import styles from './DraggablePanel.module.css';

export type DraggablePanelPlacement = Placement;

export interface DraggablePanelSize {
  height?: number | string;
  width?: number | string;
}

export interface DraggablePanelProps extends Omit<HTMLAttributes<HTMLElement>, 'onDrag'> {
  backgroundColor?: string;
  classNames?: { content?: string };
  /**
   * Preview a collapsed panel while resizing at or below this size, then commit
   * the collapsed state on pointer release. Omit to disable drag-to-collapse.
   */
  collapseThreshold?: number;
  defaultExpand?: boolean;
  defaultSize?: DraggablePanelSize;
  expand?: boolean;
  /** Show the seam toggle that collapses and expands the panel. */
  expandable?: boolean;
  maxHeight?: number;
  maxWidth?: number;
  minHeight?: number;
  minWidth?: number;
  /** `float` overlays the panel on its container edge instead of taking layout space. */
  mode?: 'fixed' | 'float';
  onExpandChange?: (expand: boolean) => void;
  /** Committed resize (pointer release, keyboard, double-click reset). */
  onSizeChange?: (delta: DraggablePanelSize, size: DraggablePanelSize) => void;
  /** Live size while the handle is being dragged. */
  onSizeDragging?: (delta: DraggablePanelSize, size: DraggablePanelSize) => void;
  /** Resolved against the inline axis: `left` means inline-start and flips under RTL. */
  placement?: DraggablePanelPlacement;
  showBorder?: boolean;
  showHandleWhenCollapsed?: boolean;
  /** Widen the resize hit area from 8px to 16px. A coarse pointer always gets 20px. */
  showHandleWideArea?: boolean;
  size?: DraggablePanelSize;
  styles?: { content?: CSSProperties };
}

interface PanelContextValue {
  controller: PanelController;
  expand: boolean;
  expandable: boolean;
  placement: Placement;
  showBorder: boolean;
  state: PanelState;
  toggleExpand: () => void;
}

const PanelContext = createContext<PanelContextValue | null>(null);
const usePanel = () => use(PanelContext)!;

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const usePanelStore = <T,>(controller: PanelController, read: () => T) =>
  useSyncExternalStore(controller.subscribe, read, read);

const ORIGIN: Record<Placement, string> = {
  bottom: 'center bottom',
  left: 'left center',
  right: 'right center',
  top: 'center top',
};
const EDGE_INSET: Record<Placement, keyof CSSProperties> = {
  bottom: 'insetBlockEnd',
  left: 'insetInlineStart',
  right: 'insetInlineEnd',
  top: 'insetBlockStart',
};
const FLOAT_CLASS: Record<Placement, string> = {
  bottom: styles.floatBottom,
  left: styles.floatLeft,
  right: styles.floatRight,
  top: styles.floatTop,
};
const TOGGLE_CLASS: Record<Placement, string> = {
  bottom: styles.toggleOnTop,
  left: styles.toggleOnRight,
  right: styles.toggleOnLeft,
  top: styles.toggleOnBottom,
};
const COLLAPSED_SCALE = 0.97;
const PAN_THRESHOLD = 3;

// The seam arrow: a stroke that bends out of the panel border toward the
// direction the panel will move.
const SEAM = { depth: 6.5, half: 11, lead: 6, stroke: 1.25 };
const ARROW_BOX = (SEAM.half + SEAM.lead) * 2;
const ARROW_C = ARROW_BOX / 2;
const ARROW_PATH = (() => {
  const { depth: d, half: h, lead } = SEAM;
  const c = ARROW_C;
  const r = 0.12;
  return [
    `M${c} ${c - h - lead}`,
    `Q${c} ${c - h} ${c - d * r} ${c - h + h * r}`,
    `L${c - d * 0.88} ${c - h * r}`,
    `Q${c - d} ${c} ${c - d * 0.88} ${c + h * r}`,
    `L${c - d * r} ${c + h - h * r}`,
    `Q${c} ${c + h} ${c} ${c + h + lead}`,
  ].join(' ');
})();

const PanelContent = ({
  children,
  className,
  style,
}: {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) => {
  const { controller, expand, placement, state } = usePanel();
  const axis = AXES[placement];
  const extent = useTransform(controller.motion.size, (value) => Math.max(0, value));
  const target = usePanelStore(controller, () => controller.target);
  const clipping = state.dragging || state.folding || target === 0;
  const shrunk = state.collapsing || !expand;

  return (
    <m.div
      inert={!expand}
      style={{
        display: 'flex',
        flexDirection: axis.vertical ? 'column' : 'row',
        flexShrink: 0,
        justifyContent: axis.anchorEnd ? 'flex-end' : 'flex-start',
        overflow: clipping ? 'clip' : 'visible',
        [axis.cross]: '100%',
        [axis.extent]: extent,
      }}
    >
      <m.div
        animate={{ scale: shrunk ? COLLAPSED_SCALE : 1 }}
        className={cn(styles.content, className)}
        transition={timing()}
        style={{
          transformOrigin: ORIGIN[placement],
          [axis.cross]: '100%',
          [axis.extent]: controller.motion.content,
          ...style,
        }}
      >
        {children}
      </m.div>
    </m.div>
  );
};

const PanelHandle = ({ wideArea }: { wideArea: boolean }) => {
  const { controller, expand, placement, showBorder, state } = usePanel();
  const axis = AXES[placement];
  const size = useSyncExternalStore(
    coarsePointer.subscribe,
    () => handleSize(wideArea),
    () => handleSize(wideArea),
  );
  const target = usePanelStore(controller, () => controller.target);
  const pressedRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const draggedRef = useRef(false);

  useEffect(() => () => controller.drag.cancel(), [controller]);

  if (!expand) return null;

  const { max, min } = controller.bounds();
  const finish = () => {
    if (draggingRef.current) controller.drag.end();
    pressedRef.current = null;
    draggingRef.current = false;
  };

  return (
    <div
      aria-orientation={axis.ariaOrientation}
      aria-valuemax={Number.isFinite(max) ? max : undefined}
      aria-valuemin={min}
      aria-valuenow={target}
      aria-valuetext={`${target} pixels`}
      data-border={showBorder}
      data-resizing={state.dragging || undefined}
      role="separator"
      tabIndex={0}
      className={cn(
        styles.handle,
        axis.edge === 'left' || axis.edge === 'right'
          ? styles.handleVertical
          : styles.handleHorizontal,
      )}
      style={
        {
          '--draggable-panel-handle-size': `${size}px`,
          [EDGE_INSET[axis.edge]]: -size / 2,
        } as CSSProperties
      }
      onKeyDown={(event) => controller.resizeByKey(event)}
      onLostPointerCapture={finish}
      onPointerUp={finish}
      onDoubleClick={() => {
        if (!draggedRef.current) controller.reset();
      }}
      onPointerCancel={() => {
        controller.drag.cancel();
        pressedRef.current = null;
        draggingRef.current = false;
      }}
      onPointerDown={(event) => {
        draggedRef.current = false;
        pressedRef.current = { x: event.clientX, y: event.clientY };
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // The pointer may already be released (synthetic events, fast taps).
        }
      }}
      onPointerMove={(event) => {
        if (!pressedRef.current) return;
        const offset = {
          x: event.clientX - pressedRef.current.x,
          y: event.clientY - pressedRef.current.y,
        };
        if (!draggingRef.current) {
          if (Math.hypot(offset.x, offset.y) < PAN_THRESHOLD) return;
          draggingRef.current = true;
          draggedRef.current = true;
          controller.drag.start();
        }
        controller.drag.move(offset);
      }}
    />
  );
};

const PanelToggle = ({ showHandleWhenCollapsed }: { showHandleWhenCollapsed?: boolean }) => {
  const { expand, expandable, placement, showBorder, toggleExpand } = usePanel();
  const gradientId = `seam-arrow-${useId().replaceAll(/[^\w-]/g, '')}`;
  if (!expandable) return null;

  const bend = (placement === 'left' || placement === 'top' ? 1 : -1) * (expand ? 1 : -1);
  const edgeOpacity = expand && showBorder ? 1 : 0;

  return (
    <div
      className={cn(styles.toggle, TOGGLE_CLASS[placement])}
      style={{ opacity: expand ? undefined : showHandleWhenCollapsed ? 1 : 0 }}
    >
      <button
        aria-label={expand ? 'Collapse panel' : 'Expand panel'}
        type="button"
        onClick={toggleExpand}
      >
        <svg
          fill="none"
          height={ARROW_BOX}
          style={{ '--seam-bend': bend } as CSSProperties}
          viewBox={`0 0 ${ARROW_BOX} ${ARROW_BOX}`}
          width={ARROW_BOX}
        >
          <defs>
            <linearGradient
              gradientUnits="userSpaceOnUse"
              id={gradientId}
              x1={ARROW_C}
              x2={ARROW_C}
              y1={0}
              y2={ARROW_BOX}
            >
              <stop data-end="" offset={0} stopOpacity={edgeOpacity} />
              <stop data-tip="" offset={0.3} />
              <stop data-tip="" offset={0.7} />
              <stop data-end="" offset={1} stopOpacity={edgeOpacity} />
            </linearGradient>
          </defs>
          <g transform={AXES[placement].vertical ? `rotate(90 ${ARROW_C} ${ARROW_C})` : undefined}>
            <path
              d={ARROW_PATH}
              stroke={`url(#${gradientId})`}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={SEAM.stroke}
            />
          </g>
        </svg>
      </button>
    </div>
  );
};

const toNumber = (value: number | string | undefined) =>
  typeof value === 'number' ? Math.max(value, 0) : undefined;

/**
 * Resizable, collapsible side or bottom panel. Drag the seam (or focus it and
 * use the arrow keys) to resize between the min and max size; double-click it
 * to restore the default size. With `expandable`, a toggle on the seam folds
 * the panel away. Size and expansion are each controlled when passed.
 */
const DraggablePanel = memo<DraggablePanelProps>(
  ({
    backgroundColor,
    children,
    className,
    classNames,
    collapseThreshold,
    defaultExpand = true,
    defaultSize,
    expand: expandProp,
    expandable = true,
    maxHeight,
    maxWidth,
    minHeight,
    minWidth,
    mode = 'fixed',
    onExpandChange,
    onSizeChange,
    onSizeDragging,
    placement = 'right',
    showBorder = true,
    showHandleWhenCollapsed,
    showHandleWideArea = true,
    size: sizeProp,
    style,
    styles: customStyles,
    ...rest
  }) => {
    const axis = AXES[placement];
    const pick = (value?: DraggablePanelSize) =>
      toNumber(axis.vertical ? value?.height : value?.width);
    const toSize = (value: number): DraggablePanelSize =>
      axis.vertical ? { height: value, width: '100%' } : { height: '100%', width: value };
    const toDelta = (value: number): DraggablePanelSize =>
      axis.vertical ? { height: value, width: 0 } : { height: 0, width: value };

    const resolvedDefaultSize = pick(defaultSize) ?? (axis.vertical ? 180 : 280);
    const [innerExpand, setInnerExpand] = useState(defaultExpand);
    const isExpand = expandProp ?? innerExpand;
    const setExpand = useCallback(
      (next: boolean) => {
        if (expandProp === undefined) setInnerExpand(next);
        onExpandChange?.(next);
      },
      [expandProp, onExpandChange],
    );

    const controlledSize = pick(sizeProp);
    const [innerSize, setInnerSize] = useState(resolvedDefaultSize);

    const options: PanelOptions = {
      collapseThreshold,
      defaultSize: resolvedDefaultSize,
      expand: isExpand,
      max: pick({ height: maxHeight, width: maxWidth }),
      min: pick({ height: minHeight, width: minWidth }) ?? 0,
      onExpandChange: setExpand,
      onSizeChange: (next, delta) => {
        if (controlledSize === undefined) setInnerSize(next);
        onSizeChange?.(toDelta(delta), toSize(next));
      },
      onSizeDragging: (next, delta) => onSizeDragging?.(toDelta(delta), toSize(next)),
      placement,
      size: controlledSize ?? innerSize,
    };

    const [controller] = useState(() => createPanelController(options));
    const state = usePanelStore(controller, () => controller.state);
    const elementRef = useRef<HTMLElement>(null);

    useIsomorphicLayoutEffect(() => {
      controller.sync(options);
    });
    useIsomorphicLayoutEffect(() => {
      const node = elementRef.current;
      return node ? controller.attach(node) : undefined;
    }, [controller]);

    const toggleExpand = useCallback(() => {
      if (expandable) setExpand(!isExpand);
    }, [expandable, isExpand, setExpand]);

    const context = useMemo<PanelContextValue>(
      () => ({
        controller,
        expand: isExpand,
        expandable,
        placement,
        showBorder,
        state,
        toggleExpand,
      }),
      [controller, isExpand, expandable, placement, showBorder, state, toggleExpand],
    );

    return (
      <PanelContext value={context}>
        <aside
          data-expand={isExpand}
          data-expandable={expandable}
          data-resizing={state.dragging}
          ref={elementRef}
          className={cn(
            styles.root,
            mode === 'fixed' ? styles.fixed : [styles.float, FLOAT_CLASS[placement]],
            className,
          )}
          style={
            {
              '--draggable-panel-bg': backgroundColor || '',
              'flexDirection': axis.vertical ? 'column' : 'row',
            } as CSSProperties
          }
          {...rest}
        >
          <PanelToggle showHandleWhenCollapsed={showHandleWhenCollapsed} />
          {/* `style` styles the content box, matching the retired lobehub panel. */}
          <PanelContent
            className={classNames?.content}
            style={{ ...customStyles?.content, ...style }}
          >
            {children}
          </PanelContent>
          <PanelHandle wideArea={showHandleWideArea} />
        </aside>
      </PanelContext>
    );
  },
);
DraggablePanel.displayName = 'DraggablePanel';

export default DraggablePanel;
