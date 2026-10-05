import { MoreHorizontal } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';

import { useTopicActionsDropdownMenu } from './useDropdownMenu';

const Actions = memo(() => {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const menuItems = useTopicActionsDropdownMenu({ onUploadClose: () => setOpen(false) });

  return (
    <SidebarDropdownMenu items={menuItems} open={open} onOpenChange={setOpen}>
      <ActionIcon
        active={open}
        className="data-[popup-open]:bg-muted data-[popup-open]:hover:bg-muted data-[popup-open]:text-foreground"
        icon={MoreHorizontal}
        size={'small'}
        title={t('more')}
      />
    </SidebarDropdownMenu>
  );
});

export default Actions;
