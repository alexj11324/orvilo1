import { ActionIcon } from '@lobehub/ui/base-ui';
import { MoreHorizontalIcon } from 'lucide-react';
import { memo } from 'react';

import SidebarDropdownMenu, {
  type SidebarDropdownMenuProps,
} from '@/features/NavPanel/components/SidebarDropdownMenu';

interface ActionsProps {
  dropdownMenu: SidebarDropdownMenuProps['items'];
}

const Actions = memo<ActionsProps>(({ dropdownMenu }) => {
  if (!dropdownMenu || (typeof dropdownMenu !== 'function' && dropdownMenu.length === 0))
    return null;

  return (
    <SidebarDropdownMenu items={dropdownMenu}>
      <ActionIcon icon={MoreHorizontalIcon} size={'small'} />
    </SidebarDropdownMenu>
  );
});

export default Actions;
