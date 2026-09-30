'use client';

import type { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import { type SidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
import { closeContextMenu, showContextMenuWithFallback } from '@/libs/contextMenu';
import type { NativeContextMenuItem } from '@/libs/contextMenu/types';

import { renderSidebarMenuItems } from './SidebarDropdownMenu';

type SidebarContextMenuItems =
  SidebarMenuItems | NativeContextMenuItem[] | (() => SidebarMenuItems | NativeContextMenuItem[]);

export interface SidebarContextMenuProps {
  children: ReactElement;
  items: SidebarContextMenuItems;
  /**
   * Called once the context menu actually opens — for the native popup on
   * desktop and for the web menu elsewhere. Receives the right close function
   * for whichever surface opened, so callers can finish imperative flows
   * (e.g. digit-accelerator picks) the imperative `closeContextMenu` cannot
   * reach inside a controlled ReUI root.
   */
  onMenuOpen?: (closeMenu: () => void) => void;
}

const resolveItems = (items: SidebarContextSidebarMenuItems) =>
  (typeof items === 'function' ? items() : items) ?? [];

export default function SidebarContextMenu({
  children,
  items,
  onMenuOpen,
}: SidebarContextMenuProps) {
  const [open, setOpen] = useState(false);
  const resolvedItems = resolveItems(items);

  return (
    <ContextMenu
      open={open}
      onOpenChange={(next, eventDetails) => {
        if (!next) {
          setOpen(false);
          return;
        }
        let useWebMenu = false;
        showContextMenuWithFallback(resolvedItems, undefined, () => {
          useWebMenu = true;
        });
        if (!useWebMenu) {
          eventDetails.cancel();
          onMenuOpen?.(closeContextMenu);
          return;
        }
        setOpen(true);
        onMenuOpen?.(() => setOpen(false));
      }}
    >
      <ContextMenuTrigger render={children} />
      <ContextMenuContent>
        {renderSidebarMenuItems(resolvedItems, [], 'context')}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export interface SidebarContextMenuPopupProps {
  /**
   * Anchor for the Positioner — a DOM element or a virtual element such as
   * the pointer position (`{ getBoundingClientRect }`). Required; the menu is
   * opened imperatively and has no trigger to anchor to.
   */
  anchor?: ContextMenuPrimitive.Positioner.Props['anchor'];
  items: SidebarContextMenuItems;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

/**
 * Controlled context menu anchored at an arbitrary point — for rows that
 * surface a right-click through a non-trigger channel (e.g. antd Tree's
 * `onRightClick`) where the menu must float at the pointer.
 */
export function SidebarContextMenuPopup({
  anchor,
  items,
  onOpenChange,
  open,
}: SidebarContextMenuPopupProps) {
  const resolvedItems = resolveItems(items);

  return (
    <ContextMenu
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
    >
      <ContextMenuContent anchor={anchor}>
        {renderSidebarMenuItems(resolvedItems, [], 'context')}
      </ContextMenuContent>
    </ContextMenu>
  );
}
