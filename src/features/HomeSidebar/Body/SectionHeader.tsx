'use client';

import { MoreHorizontalIcon } from 'lucide-react';
import { type ReactElement, type ReactNode } from 'react';

import { CollapsibleTrigger } from '@/components/ui/collapsible';
import { SidebarGroupAction, SidebarGroupLabel } from '@/components/ui/sidebar';
import SidebarCollapseIcon from '@/features/NavPanel/components/SidebarCollapseIcon';
import SidebarContextMenu from '@/features/NavPanel/components/SidebarContextMenu';
import { type SidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';

interface SectionHeaderProps {
  children: ReactNode;
  /** Right-click menu on the label itself; omitted when the label has none. */
  contextMenu?: SidebarMenuItems;
  moreLabel: string;
  moreMenu: SidebarMenuItems;
}

/**
 * Shared header of the collapsible sidebar groups (Workspace, Favorites, Your
 * teams). Must sit inside a `Collapsible` rendered as the `SidebarGroup`
 * (`group/section`): the label is the collapsible trigger, rendered through
 * `SidebarGroupLabel`, and "more" is a `SidebarGroupAction` that stays visible
 * while its menu is open.
 */
const SectionHeader = ({ children, contextMenu, moreLabel, moreMenu }: SectionHeaderProps) => {
  const renderLabel = (trigger: ReactElement) => (
    <SidebarGroupLabel className="w-full cursor-pointer gap-0.5 whitespace-nowrap" render={trigger}>
      {children}
      <SidebarCollapseIcon />
    </SidebarGroupLabel>
  );

  return (
    <>
      {contextMenu ? (
        <SidebarContextMenu items={contextMenu}>
          {(trigger) => renderLabel(trigger(<CollapsibleTrigger />))}
        </SidebarContextMenu>
      ) : (
        renderLabel(<CollapsibleTrigger />)
      )}
      <SidebarDropdownMenu items={moreMenu}>
        <SidebarGroupAction
          aria-label={moreLabel}
          className="opacity-0 group-hover/section:opacity-100 group-focus-within/section:opacity-100 aria-expanded:opacity-100 data-popup-open:opacity-100"
        >
          <MoreHorizontalIcon />
        </SidebarGroupAction>
      </SidebarDropdownMenu>
    </>
  );
};

export default SectionHeader;
