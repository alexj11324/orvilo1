'use client';

import { ActionIcon } from '@lobehub/ui/base-ui';
import { MoreHorizontal } from 'lucide-react';
import { memo } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { renderSidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
import HeaderSlot from '@/routes/(main)/agent/(chat)/_layout/HeaderSlot';

import { useMenu } from './useMenu';

const HeaderActions = memo(() => {
  const { menuHeader, menuItems } = useMenu();

  return (
    <>
      <HeaderSlot.Outlet />
      <DropdownMenu>
        <DropdownMenuTrigger render={<ActionIcon icon={MoreHorizontal} size={'small'} />} />
        <DropdownMenuContent align="end" side="bottom">
          {menuHeader && (
            <DropdownMenuGroup>
              <DropdownMenuLabel>{menuHeader}</DropdownMenuLabel>
            </DropdownMenuGroup>
          )}
          {renderSidebarMenuItems(typeof menuItems === 'function' ? menuItems() : menuItems)}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
});

HeaderActions.displayName = 'HeaderActions';

export default HeaderActions;
