'use client';

import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { cn } from 'cn';
import type { KeyboardEventHandler, ReactNode } from 'react';

import { popoverPlacement } from '@/components/ItemsMenu/placement';
import { POPUP_Z_CLASS } from '@/components/ui/zIndex';
import { getFloatingCollisionPadding } from '@/libs/floatingCollisionPadding';

/** Row look shared by the panel's menu items and submenu triggers. */
export const menuItemClassName =
  'relative flex w-full cursor-pointer items-center overflow-hidden rounded-(--radius-input) px-3 py-1.5 text-sm text-foreground outline-none select-none hover:bg-accent active:bg-selected data-highlighted:bg-accent data-popup-open:bg-accent data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:hover:bg-transparent';

/** Group caption inside a menu popup. */
export const menuGroupLabelClassName = 'px-3 pt-2 pb-1 select-none';

interface MenuPanelPopupProps {
  alignOffset?: number;
  children?: ReactNode;
  className?: string;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  /** lobehub-style placement such as `topLeft` or `right`. */
  placement?: string;
  sideOffset?: number;
}

/**
 * Portal + positioner + popup for the model panel and its side detail
 * popups; works under both a root menu and a submenu.
 */
export const MenuPanelPopup = ({
  alignOffset,
  children,
  className,
  onKeyDown,
  placement,
  sideOffset = 6,
}: MenuPanelPopupProps) => {
  const { align, side } = popoverPlacement(placement);

  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        className={cn('isolate outline-none', POPUP_Z_CLASS)}
        collisionPadding={getFloatingCollisionPadding()}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          className={cn(
            POPUP_Z_CLASS,
            'max-h-(--available-height) min-w-55 origin-(--transform-origin) overflow-y-auto rounded-(--radius-overlay) bg-popover p-1 text-popover-foreground shadow-(--shadow-popover) ring-1 ring-foreground/10 outline-none',
            // Vertical menus scale in and out; side (detail) popups switch instantly.
            'data-[side=bottom]:data-open:animate-in data-[side=bottom]:data-open:fade-in-0 data-[side=bottom]:data-open:zoom-in-95 data-[side=bottom]:data-closed:animate-out data-[side=bottom]:data-closed:fade-out-0 data-[side=top]:data-open:animate-in data-[side=top]:data-open:fade-in-0 data-[side=top]:data-open:zoom-in-95 data-[side=top]:data-closed:animate-out data-[side=top]:data-closed:fade-out-0',
            className,
          )}
          onKeyDown={onKeyDown}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
};
