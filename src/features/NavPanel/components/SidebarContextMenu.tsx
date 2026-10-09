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

/**
 * Builds the context-menu trigger element around `inner` (the real row element,
 * e.g. the router link). Hand it to a sidebar primitive's `render` prop so the
 * primitive owns the DOM node and keeps its `data-slot` / `data-sidebar` /
 * `data-active` attributes: `<SidebarMenuButton render={trigger(<a … />)} />`.
 */
export type SidebarContextMenuTrigger = (inner: ReactElement) => ReactElement;

export interface SidebarContextMenuProps {
  /**
   * An element is cloned by the trigger, which stamps its own
   * `data-slot="context-menu-trigger"` over the child's slot. Pass a function to
   * compose the trigger inside a sidebar primitive instead.
   */
  children: ReactElement | ((trigger: SidebarContextMenuTrigger) => ReactElement);
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

const resolveItems = (items: SidebarContextMenuItems) =>
  (typeof items === 'function' ? items() : items) ?? [];

const isNativeMenuItem = (item: SidebarMenuItems[number]): item is NativeContextMenuItem => {
  if (item === null) return true;
  if (!item) return false;
  if (item.type === 'divider') return true;
  if (
    item.type !== undefined &&
    item.type !== 'group' &&
    item.type !== 'submenu' &&
    item.type !== 'checkbox' &&
    item.type !== 'switch'
  ) {
    return false;
  }
  if ('children' in item && item.children && !item.children.every(isNativeMenuItem)) return false;
  if (item.type === 'group' || item.type === 'submenu') return true;
  return typeof item.key === 'string' || typeof item.key === 'number';
};

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
        const nativeItems = resolvedItems.filter((item) => item !== undefined);
        if (nativeItems.every(isNativeMenuItem)) {
          showContextMenuWithFallback(nativeItems, undefined, () => {
            useWebMenu = true;
          });
        } else {
          useWebMenu = true;
        }
        if (!useWebMenu) {
          eventDetails.cancel();
          onMenuOpen?.(closeContextMenu);
          return;
        }
        setOpen(true);
        onMenuOpen?.(() => setOpen(false));
      }}
    >
      {typeof children === 'function' ? (
        children(renderContextMenuTrigger)
      ) : (
        <ContextMenuTrigger render={children} />
      )}
      <ContextMenuContent>
        {renderSidebarMenuItems(resolvedItems, [], 'context')}
      </ContextMenuContent>
    </ContextMenu>
  );
}

const renderContextMenuTrigger: SidebarContextMenuTrigger = (inner) => (
  <ContextMenuTrigger render={inner} />
);

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
