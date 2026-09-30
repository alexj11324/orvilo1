import { MoreHorizontalIcon, PlusIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { type SidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';

interface ActionsProps {
  addMenuItems: SidebarMenuItems;
  dropdownMenu: SidebarMenuItems;
  isLoading?: boolean;
}

const Actions = memo<ActionsProps>(({ dropdownMenu, addMenuItems, isLoading }) => {
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
      <SidebarDropdownMenu items={addMenuItems}>
        <Button
          aria-busy={isLoading}
          aria-label={t('addAgent', { ns: 'chat' })}
          disabled={isLoading}
          size="icon"
          style={{ flex: 'none' }}
          variant="ghost"
        >
          {isLoading ? <Spinner /> : <PlusIcon />}
        </Button>
      </SidebarDropdownMenu>
    </div>
  );
});

export default Actions;
