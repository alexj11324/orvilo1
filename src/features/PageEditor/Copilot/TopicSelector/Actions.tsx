import { MoreHorizontalIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import SidebarDropdownMenu, {
  type SidebarDropdownMenuProps,
} from '@/features/NavPanel/components/SidebarDropdownMenu';

interface ActionsProps {
  dropdownMenu: SidebarDropdownMenuProps['items'];
}

const Actions = memo<ActionsProps>(({ dropdownMenu }) => {
  const { t: tCommon } = useTranslation('common');
  if (!dropdownMenu || (typeof dropdownMenu !== 'function' && dropdownMenu.length === 0))
    return null;

  return (
    <SidebarDropdownMenu items={dropdownMenu}>
      <ActionIcon aria-label={tCommon('more')} icon={MoreHorizontalIcon} size={'small'} />
    </SidebarDropdownMenu>
  );
});

export default Actions;
