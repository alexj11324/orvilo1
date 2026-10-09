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
      <ActionIcon aria-label={t('more')} icon={MoreHorizontal} size={'small'} />
    </SidebarDropdownMenu>
  );
});

export default Actions;
