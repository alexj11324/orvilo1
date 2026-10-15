import { animate, motionValue } from 'motion/react';

export type Placement = 'bottom' | 'left' | 'right' | 'top';

interface Axis {
  /** Content hugs the far edge (the edge opposite the handle side). */
  anchorEnd: boolean;
  ariaOrientation: 'horizontal' | 'vertical';
  cross: 'height' | 'width';
  cursor: 'col-resize' | 'row-resize';
  /** The edge the resize handle sits on. */
  edge: Placement;
  extent: 'height' | 'width';
  /** +1 when moving the pointer along `point` grows the panel. */
  grow: 1 | -1;
  point: 'x' | 'y';
  vertical: boolean;
}

export const AXES: Record<Placement, Axis> = {
  bottom: {
    anchorEnd: true,
    ariaOrientation: 'horizontal',
    cross: 'width',
    cursor: 'row-resize',
    edge: 'top',
    extent: 'height',
    grow: -1,
    point: 'y',
    vertical: true,
  },
  left: {
    anchorEnd: false,
    ariaOrientation: 'vertical',
    cross: 'height',
    cursor: 'col-resize',
    edge: 'right',
    extent: 'width',
    grow: 1,
    point: 'x',
    vertical: false,
  },
  right: {
    anchorEnd: true,
    ariaOrientation: 'vertical',
    cross: 'height',
    cursor: 'col-resize',
    edge: 'left',
    extent: 'width',
    grow: -1,
    point: 'x',
    vertical: false,
  },
  top: {
    anchorEnd: false,
    ariaOrientation: 'horizontal',
    cross: 'width',
    cursor: 'row-resize',
    edge: 'bottom',
    extent: 'height',
    grow: 1,
    point: 'y',
    vertical: true,
  },
};

const media = (query: string) => {
  let list: MediaQueryList | undefined;
  const get = () => {
    list ??= typeof matchMedia === 'function' ? matchMedia(query) : undefined;
    return list;
  };
  return {
    get: () => get()?.matches ?? false,
    subscribe: (listener: () => void) => {
      get()?.addEventListener('change', listener);
      return () => get()?.removeEventListener('change', listener);
    },
  };
};

export const coarsePointer = media('(pointer: coarse)');
const reducedMotion = media('(prefers-reduced-motion: reduce)');

/** Resize hit area: 20px for touch, else 16px (wide) or 8px. */
export const handleSize = (wide = true) => (coarsePointer.get() ? 20 : wide ? 16 : 8);

/** Matches the collapse duration call sites wait on before unmounting content. */
export const PANEL_TRANSITION = { duration: 0.25, ease: [0.32, 0.72, 0, 1] } as const;
export const timing = () => (reducedMotion.get() ? { duration: 0 } : PANEL_TRANSITION);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const isRtl = (element: HTMLElement | null) =>
  !!element && getComputedStyle(element).direction === 'rtl';

let bodyLocks = 0;
let savedBodyStyle: Partial<CSSStyleDeclaration> = {};

/** Hold the resize cursor and suppress text selection while dragging; Escape cancels. */
const lockBody = (cursor: string, onEscape: () => void) => {
  const { style } = document.body;
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onEscape();
  };
  if (bodyLocks === 0)
    savedBodyStyle = {
      cursor: style.cursor,
      userSelect: style.userSelect,
      webkitUserSelect: style.webkitUserSelect,
    };
  bodyLocks += 1;
  Object.assign(style, { cursor, userSelect: 'none', webkitUserSelect: 'none' });
  addEventListener('keydown', onKeyDown, true);
  return () => {
    bodyLocks -= 1;
    if (bodyLocks === 0) Object.assign(style, savedBodyStyle);
    removeEventListener('keydown', onKeyDown, true);
  };
};

export interface PanelOptions {
  /** Release at or below this size collapses the panel instead of resizing it. */
  collapseThreshold?: number;
  defaultSize: number;
  expand: boolean;
  max?: number;
  min: number;
  onExpandChange?: (expand: boolean) => void;
  onSizeChange?: (size: number, delta: number) => void;
  onSizeDragging?: (size: number, delta: number) => void;
  placement: Placement;
  size: number;
}

export interface PanelState {
  /** Dragged below the collapse threshold; release will collapse. */
  collapsing: boolean;
  dragging: boolean;
  /** Animating toward a new expanded/collapsed size. */
  folding: boolean;
}

const KEY_STEP = 10;
const KEY_STEP_FAST = 50;
const SCREEN_DELTA: Record<string, number> = {
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -1,
};

/**
 * Size state machine for a resizable, collapsible side panel. `size` is the
 * outer (clipping) extent and animates to 0 when collapsed; `content` keeps the
 * inner width so the content does not reflow while the panel folds.
 */
export const createPanelController = (initial: PanelOptions) => {
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };

  let element: HTMLElement | null = null;
  let options = initial;
  let target = initial.expand ? initial.size : 0;
  let state: PanelState = { collapsing: false, dragging: false, folding: false };
  let unlock: (() => void) | undefined;
  let foldTo = target;

  const size = motionValue(target);
  const content = motionValue(initial.size);
  const session = { collapsing: false, max: 0, min: 0, sign: 1, start: 0 };

  const patch = (next: Partial<PanelState>) => {
    if ((Object.keys(next) as (keyof PanelState)[]).some((key) => state[key] !== next[key])) {
      state = { ...state, ...next };
      notify();
    }
  };

  const bounds = () => {
    const min = Math.max(0, options.min);
    return {
      max: options.max === undefined ? Number.POSITIVE_INFINITY : Math.max(min, options.max),
      min,
    };
  };

  const growSign = () => {
    const axis = AXES[options.placement];
    return axis.grow * (axis.vertical || !isRtl(element) ? 1 : -1);
  };

  const fold = (to: number) => {
    foldTo = to;
    patch({ folding: true });
    if (size.get() === 0) content.jump(to || content.get());
    else if (to > 0) animate(content, to, timing());
    animate(size, to, timing());
  };

  const release = () => {
    unlock?.();
    unlock = undefined;
  };

  const stopDragging = () => {
    release();
    patch({ collapsing: false, dragging: false });
  };

  const drag = {
    cancel: () => {
      if (!state.dragging) return;
      size.jump(session.start);
      content.jump(session.start);
      stopDragging();
    },
    end: () => {
      if (!state.dragging) return;
      const { collapsing, start } = session;
      const committed = collapsing ? start : size.get();
      stopDragging();
      if (collapsing) {
        content.jump(start);
        options.onExpandChange?.(false);
      }
      options.onSizeChange?.(committed, committed - start);
    },
    move: (offset: { x: number; y: number }) => {
      if (!state.dragging) return;
      const axis = AXES[options.placement];
      const pixels = session.start + offset[axis.point] * session.sign;
      const collapsing =
        options.collapseThreshold !== undefined && pixels < options.collapseThreshold;
      const next = collapsing ? 0 : Math.round(clamp(pixels, session.min, session.max));
      size.jump(next);
      if (!collapsing) content.jump(next);
      if (collapsing !== session.collapsing) {
        session.collapsing = collapsing;
        patch({ collapsing });
      }
      const reported = collapsing ? session.start : next;
      options.onSizeDragging?.(reported, reported - session.start);
    },
    start: () => {
      Object.assign(session, {
        ...bounds(),
        collapsing: false,
        sign: growSign(),
        start: size.get(),
      });
      release();
      if (typeof document !== 'undefined')
        unlock = lockBody(AXES[options.placement].cursor, drag.cancel);
      patch({ dragging: true, folding: false });
    },
  };

  const resizeByKey = (event: { key: string; preventDefault: () => void; shiftKey?: boolean }) => {
    if (event.key === 'Enter' || event.key === ' ') {
      if (!options.onExpandChange) return;
      event.preventDefault();
      options.onExpandChange(!options.expand);
      return;
    }
    const { max, min } = bounds();
    const fast = event.shiftKey || event.key === 'PageUp' || event.key === 'PageDown';
    const step = (fast ? KEY_STEP_FAST : KEY_STEP) * growSign();
    const vertical = AXES[options.placement].vertical;
    const onAxis = vertical
      ? event.key === 'ArrowUp' || event.key === 'ArrowDown'
      : event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    const moves: Record<string, number> = {
      End: Number.isFinite(max) ? max : target,
      Home: min,
      PageDown: target + step,
      PageUp: target - step,
    };
    const next = onAxis ? target + SCREEN_DELTA[event.key] * step : moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const value = clamp(next, min, max);
    if (!options.expand && value > 0) options.onExpandChange?.(true);
    options.onSizeChange?.(value, value - target);
  };

  /** Apply the latest props; animates to the new target unless a drag owns the size. */
  const sync = (next: PanelOptions) => {
    options = next;
    const value = next.expand ? next.size : 0;
    if (size.get() === 0 && value > 0) content.jump(next.size);
    if (value !== target) {
      target = value;
      notify();
    }
    if (state.dragging) return;
    if (size.get() === target) {
      size.stop();
      content.stop();
      if (state.folding) {
        patch({ folding: false });
        content.jump(target || content.get());
      }
      foldTo = target;
    } else if (!state.folding || foldTo !== target) fold(target);
  };

  return {
    attach: (node: HTMLElement) => {
      element = node;
      const stopSettle = size.on('animationComplete', () => {
        if (size.get() === target) patch({ folding: false });
      });
      return () => {
        stopSettle();
        release();
        element = null;
      };
    },
    bounds,
    drag,
    motion: { content, size },
    /** Double-click on the handle: restore the default size (and expand). */
    reset: () => {
      if (!options.expand) options.onExpandChange?.(true);
      options.onSizeChange?.(options.defaultSize, options.defaultSize - target);
    },
    resizeByKey,
    get state() {
      return state;
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    sync,
    get target() {
      return target;
    },
  };
};

export type PanelController = ReturnType<typeof createPanelController>;
