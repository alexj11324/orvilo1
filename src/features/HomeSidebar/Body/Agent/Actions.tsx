import { MoreHorizontalIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { type SidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';

interface ActionsProps {
  dropdownMenu: SidebarMenuItems;
}

const Actions = memo<ActionsProps>(({ dropdownMenu }) => {
  const { t } = useTranslation('common');

  return (
    <div className="flex gap-[2px]">
      <SidebarDropdownMenu items={dropdownMenu}>
        <Button
          aria-label={t('more', { ns: 'common' })}
          size="icon"
          style={{ flex: 'none' }}
          variant="ghost"
        >
          <MoreHorizontalIcon />
        </Button>
      </SidebarDropdownMenu>
    </div>
  );
});

export default Actions;
