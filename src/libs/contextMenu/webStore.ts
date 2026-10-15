import type { ContextMenuItem, ShowContextMenuOptions } from './webTypes';

export interface ContextMenuInterceptor {
  close?: (fallback: () => void) => void;
  show?: (
    items: ContextMenuItem[],
    options: ShowContextMenuOptions | undefined,
    fallback: () => void,
  ) => void;
}
interface WebMenuState extends ShowContextMenuOptions {
  items: ContextMenuItem[];
  open: boolean;
  point?: { x: number; y: number };
}
const empty: WebMenuState = { items: [], open: false };
let snapshot = empty;
let interceptor: ContextMenuInterceptor | null = null;
let pointer: { x: number; y: number } | undefined;
let returnFocus: HTMLElement | undefined;
const listeners = new Set<() => void>();
const publish = (next: WebMenuState) => {
  snapshot = next;
  listeners.forEach((listener) => listener());
};
export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getSnapshot = () => snapshot;
export const getServerSnapshot = () => empty;
export const updateLastPointer = (event: PointerEvent | MouseEvent) => {
  pointer = { x: event.clientX, y: event.clientY };
};
export const setContextMenuInterceptor = (next: ContextMenuInterceptor | null) => {
  interceptor = next;
};
export const closeWebContextMenu = () => {
  const restore = returnFocus;
  returnFocus = undefined;
  publish(empty);
  if (restore?.isConnected) restore.focus({ preventScroll: true });
};
export const showWebContextMenu = (items: ContextMenuItem[], options?: ShowContextMenuOptions) => {
  if (typeof window === 'undefined') return;
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  publish({
    ...options,
    items,
    open: true,
    point: pointer ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 },
  });
};
export const showContextMenu = (items: ContextMenuItem[], options?: ShowContextMenuOptions) => {
  if (interceptor?.show) interceptor.show(items, options, () => showWebContextMenu(items, options));
  else showWebContextMenu(items, options);
};
export const closeContextMenu = () => {
  if (interceptor?.close) interceptor.close(closeWebContextMenu);
  else closeWebContextMenu();
};
export const updateContextMenuItems = (items: ContextMenuItem[]) => publish({ ...snapshot, items });
