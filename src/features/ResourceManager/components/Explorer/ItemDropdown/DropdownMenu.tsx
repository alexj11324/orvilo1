import { MoreHorizontalIcon } from 'lucide-react';
import { memo } from 'react';

import ActionIcon from '@/components/ActionIcon';
import { type DropdownItem, DropdownMenu as DropdownMenuUI } from '@/components/ItemsMenu';

interface DropdownMenuProps {
  className?: string;
  items: DropdownItem[] | (() => DropdownItem[]);
}

const DropdownMenu = memo<DropdownMenuProps>(({ items, className }) => {
  return (
    <DropdownMenuUI items={items}>
      <ActionIcon className={className} icon={MoreHorizontalIcon} size={'small'} />
    </DropdownMenuUI>
  );
});

export default DropdownMenu;
