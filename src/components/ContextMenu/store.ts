import type { ReactNode } from 'react';

import type { ContextMenuItem, ShowContextMenuOptions } from './types';

interface Point {
  x: number;
  y: number;
}

export interface ContextMenuState {
  footer?: ReactNode;
  header?: ReactNode;
  items: ContextMenuItem[];
  open: boolean;
  point: Point | null;
}

const emptyState: ContextMenuState = { items: [], open: false, point: null };

let state = emptyState;
const listeners = new Set<() => void>();
const lastPointer: Point & { ready: boolean } = { ready: false, x: 0, y: 0 };

const setState = (next: Partial<ContextMenuState>, replace = false) => {
  state = replace ? { ...emptyState, ...next } : { ...state, ...next };
  for (const listener of listeners) listener();
};

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getSnapshot = () => state;
export const getServerSnapshot = () => emptyState;

/** Records where the pointer last went down so the menu opens at the cursor. */
export const updateLastPointer = (event: MouseEvent | PointerEvent) => {
  lastPointer.x = event.clientX;
  lastPointer.y = event.clientY;
  lastPointer.ready = true;
};

/** Opens the web context menu at the last pointer position (viewport center before any). */
export const showContextMenu = (items: ContextMenuItem[], options?: ShowContextMenuOptions) => {
  if (typeof window === 'undefined') return;

  const point = lastPointer.ready
    ? { x: lastPointer.x, y: lastPointer.y }
    : { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  setState({ footer: options?.footer, header: options?.header, items, open: true, point }, true);
};

/** Replaces the items of the open menu without moving it. */
export const updateContextMenuItems = (items: ContextMenuItem[]) => {
  if (typeof window === 'undefined') return;
  setState({ items });
};

export const closeContextMenu = () => {
  setState({}, true);
};
