import { ActionIcon } from '@lobehub/ui/base-ui';
import { MoreHorizontal } from 'lucide-react';
import { memo, useState } from 'react';

import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';

import { useTopicActionsDropdownMenu } from './useDropdownMenu';

const Actions = memo(() => {
  const [open, setOpen] = useState(false);
  const menuItems = useTopicActionsDropdownMenu({ onUploadClose: () => setOpen(false) });

  return (
    <SidebarDropdownMenu items={menuItems} open={open} onOpenChange={setOpen}>
      <ActionIcon icon={MoreHorizontal} size={'small'} />
    </SidebarDropdownMenu>
  );
});

export default Actions;
