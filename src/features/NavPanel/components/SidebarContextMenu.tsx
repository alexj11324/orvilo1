'use client';

import type { MenuProps } from '@lobehub/ui';
import type { ReactElement } from 'react';

import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import { showContextMenuWithFallback } from '@/libs/contextMenu';

import { renderSidebarMenuItems } from './SidebarDropdownMenu';

export interface SidebarContextMenuProps {
  children: ReactElement;
  items: MenuProps['items'] | (() => MenuProps['items']);
}

export default function SidebarContextMenu({ children, items }: SidebarContextMenuProps) {
  const resolvedItems = (typeof items === 'function' ? items() : items) ?? [];

  return (
    <ContextMenu
      onOpenChange={(open, eventDetails) => {
        if (!open) return;
        let useWebMenu = false;
        showContextMenuWithFallback(resolvedItems, undefined, () => {
          useWebMenu = true;
        });
        if (!useWebMenu) eventDetails.cancel();
      }}
    >
      <ContextMenuTrigger render={children} />
      <ContextMenuContent>
        {renderSidebarMenuItems(resolvedItems, [], 'context')}
      </ContextMenuContent>
    </ContextMenu>
  );
}
