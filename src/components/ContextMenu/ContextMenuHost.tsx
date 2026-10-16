'use client';

import { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu';
import { cn } from 'cn';
import { memo, type MouseEvent, useEffect, useMemo, useSyncExternalStore } from 'react';

import { type ActionMenuItem, renderMenuItems } from '@/components/ItemsMenu/menuItems';
import { POPUP_Z_CLASS } from '@/components/ui/zIndex';
import { getFloatingCollisionPadding } from '@/libs/floatingCollisionPadding';

import {
  closeContextMenu,
  getServerSnapshot,
  getSnapshot,
  subscribe,
  updateLastPointer,
} from './store';

const preventNativeMenu = (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

/** Renders menus opened through `showContextMenu`; mount once near the app root. */
const ContextMenuHost = memo(() => {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    window.addEventListener('pointerdown', updateLastPointer, true);
    window.addEventListener('contextmenu', updateLastPointer, true);
    return () => {
      window.removeEventListener('pointerdown', updateLastPointer, true);
      window.removeEventListener('contextmenu', updateLastPointer, true);
    };
  }, []);

  const anchor = useMemo(() => {
    const point = state.point;
    if (!point) return;
    return {
      getBoundingClientRect: () =>
        DOMRect.fromRect({ height: 0, width: 0, x: point.x, y: point.y }),
    };
  }, [state.point]);

  if (!state.open && state.items.length === 0) return null;

  const hasSlots = state.header != null || state.footer != null;
  const items = renderMenuItems(state.items as ActionMenuItem[]);

  return (
    <ContextMenuPrimitive.Root
      open={state.open}
      onOpenChange={(open) => {
        if (!open) closeContextMenu();
      }}
    >
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Positioner
          anchor={anchor}
          className={cn('isolate outline-none', POPUP_Z_CLASS)}
          collisionPadding={getFloatingCollisionPadding()}
          sideOffset={6}
        >
          <ContextMenuPrimitive.Popup
            data-slot="context-menu-content"
            className={cn(
              POPUP_Z_CLASS,
              'cn-menu-target cn-menu-translucent flex max-h-(--available-height) w-max min-w-48 max-w-(--available-width) flex-col overflow-x-hidden overflow-y-auto rounded-(--radius-overlay) bg-popover p-1 text-popover-foreground shadow-(--shadow-popover) ring-1 ring-foreground/10 outline-none',
              hasSlots && 'overflow-y-hidden',
            )}
            onContextMenu={preventNativeMenu}
          >
            {state.header != null && (
              <div className="flex-none border-b border-divider px-1.5 pbe-1">{state.header}</div>
            )}
            {hasSlots ? <div className="min-h-0 flex-1 overflow-y-auto py-1">{items}</div> : items}
            {state.footer != null && (
              <div className="flex-none border-t border-divider px-1.5 pbs-1">{state.footer}</div>
            )}
          </ContextMenuPrimitive.Popup>
        </ContextMenuPrimitive.Positioner>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
});

ContextMenuHost.displayName = 'ContextMenuHost';

export default ContextMenuHost;
