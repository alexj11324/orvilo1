import { MoreHorizontalIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { type SidebarMenuItemData } from '@/features/NavPanel/components/SidebarDropdownMenu';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';

interface ActionProps {
  dropdownMenu: SidebarMenuItemData[] | (() => SidebarMenuItemData[]);
}

const Actions = memo<ActionProps>(({ dropdownMenu }) => {
  const { t } = useTranslation('common');

  return (
    <SidebarDropdownMenu items={dropdownMenu}>
      <Button aria-label={t('more', { ns: 'common' })} size="icon" variant="ghost">
        <MoreHorizontalIcon />
      </Button>
    </SidebarDropdownMenu>
  );
});

export default Actions;
