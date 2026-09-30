import { MoreHorizontalIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { type SidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';

interface ActionsProps {
  dropdownMenu: SidebarMenuItems;
  isLoading?: boolean;
}

const Actions = memo<ActionsProps>(({ dropdownMenu, isLoading }) => {
  const { t } = useTranslation('common');

  return (
    <SidebarDropdownMenu items={dropdownMenu}>
      <Button
        aria-busy={isLoading}
        aria-label={t('more', { ns: 'common' })}

        disabled={isLoading}
        size="icon"
        variant="ghost"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {isLoading ? <Spinner /> : <MoreHorizontalIcon />}
      </Button>
    </SidebarDropdownMenu>
  );
});

export default Actions;
