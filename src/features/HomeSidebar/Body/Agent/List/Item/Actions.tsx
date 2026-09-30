import { type DropdownItem } from '@lobehub/ui';
import { MoreHorizontalIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';

interface ActionProps {
  dropdownMenu: DropdownItem[] | (() => DropdownItem[]);
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
