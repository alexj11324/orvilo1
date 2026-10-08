import { MoreHorizontalIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import SidebarDropdownMenu, {
  type SidebarMenuItems,
} from '@/features/NavPanel/components/SidebarDropdownMenu';

interface ActionsProps {
  dropdownMenu: SidebarMenuItems;
}

const Actions = memo<ActionsProps>(({ dropdownMenu }) => {
  const { t } = useTranslation('modelProvider');

  return (
    <SidebarDropdownMenu items={dropdownMenu} placement="bottomRight">
      <Button
        aria-label={t('menu.list.disabledActions.sort')}
        className="flex-none"
        size="icon-xs"
        variant="ghost"
      >
        <MoreHorizontalIcon />
      </Button>
    </SidebarDropdownMenu>
  );
});

export default Actions;
