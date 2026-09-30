'use client';

import { MoreHorizontal } from 'lucide-react';
import { memo } from 'react';

import ActionIcon from '@/components/ActionIcon';
import { renderMenuItems } from '@/components/ItemsMenu/menuItems';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
          {renderMenuItems(typeof menuItems === 'function' ? menuItems() : menuItems)}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
});

HeaderActions.displayName = 'HeaderActions';

export default HeaderActions;
