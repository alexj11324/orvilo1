'use client';

import { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu';
import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { cn } from 'cn';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { memo } from 'react';

import { POPUP_Z_CLASS } from '@/components/ui/zIndex';

import { type ActionMenuItem, type MenuInfo, renderMenuItems } from './menuItems';
import { popoverPlacement } from './placement';

export type DropdownItem = ActionMenuItem;
export type { MenuInfo };

export interface MenuProps {
  items?: DropdownItem[];
}

const POPUP_CLASSES = cn(
  POPUP_Z_CLASS,
  'cn-menu-target cn-menu-translucent min-w-32 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none',
);

export interface DropdownMenuProps {
  children?: ReactNode;
  className?: string;
  items?: DropdownItem[] | (() => DropdownItem[]);
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  placement?: string;
  popupClassName?: string;
  /** Overrides the portal container (e.g. render inside a mobile overlay). */
  portalProps?: { container?: HTMLElement | null };
  style?: CSSProperties;
}

const DropdownMenu = memo<DropdownMenuProps>(
  ({
    children,
    className,
    items,
    onOpenChange,
    open,
    placement,
    popupClassName,
    portalProps,
    style,
  }) => {
    const { align, side } = popoverPlacement(placement ?? 'bottom');
    const resolvedItems = typeof items === 'function' ? items() : (items ?? []);

    return (
      <MenuPrimitive.Root open={open} onOpenChange={(nextOpen) => onOpenChange?.(nextOpen)}>
        <MenuPrimitive.Trigger className={className} render={children as ReactElement} />
        <MenuPrimitive.Portal {...portalProps}>
          <MenuPrimitive.Positioner
            align={align}
            className={cn('isolate outline-none', POPUP_Z_CLASS)}
            side={side}
            sideOffset={6}
          >
            <MenuPrimitive.Popup className={cn(POPUP_CLASSES, popupClassName)} style={style}>
              {renderMenuItems(resolvedItems)}
            </MenuPrimitive.Popup>
          </MenuPrimitive.Positioner>
        </MenuPrimitive.Portal>
      </MenuPrimitive.Root>
    );
  },
);

DropdownMenu.displayName = 'DropdownMenu';

export interface ContextMenuTriggerProps {
  children?: ReactNode;
  items?: DropdownItem[] | (() => DropdownItem[]);
  /** Overrides the portal container (e.g. render inside a mobile overlay). */
  portalProps?: { container?: HTMLElement | null };
}

const ContextMenuTrigger = memo<ContextMenuTriggerProps>(({ children, items, portalProps }) => {
  const resolvedItems = typeof items === 'function' ? items() : (items ?? []);

  return (
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger render={children as ReactElement} />
      <ContextMenuPrimitive.Portal {...portalProps}>
        <ContextMenuPrimitive.Positioner className={cn('isolate outline-none', POPUP_Z_CLASS)}>
          <ContextMenuPrimitive.Popup className={POPUP_CLASSES}>
            {renderMenuItems(resolvedItems)}
          </ContextMenuPrimitive.Popup>
        </ContextMenuPrimitive.Positioner>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
});

ContextMenuTrigger.displayName = 'ContextMenuTrigger';

export { ContextMenuTrigger, DropdownMenu };
export default DropdownMenu;
