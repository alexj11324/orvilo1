import { ActionIcon } from '@lobehub/ui/base-ui';
import { MoreHorizontalIcon } from 'lucide-react';
import { memo } from 'react';

import { type DropdownItem, DropdownMenu } from '@/components/ItemsMenu';

interface ActionProps {
  dropdownMenu: DropdownItem[] | (() => DropdownItem[]);
}

const Actions = memo<ActionProps>(({ dropdownMenu }) => {
  return (
    <DropdownMenu items={dropdownMenu}>
      <ActionIcon icon={MoreHorizontalIcon} size={'small'} />
    </DropdownMenu>
  );
});

export default Actions;
