import { MoreHorizontalIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import type { SidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useOverlayDropdownPortalProps } from '@/features/NavPanel/OverlayContainer';

interface ActionProps {
  dropdownMenu: SidebarMenuItems | (() => SidebarMenuItems);
}

const Actions = memo<ActionProps>(({ dropdownMenu }) => {
  const { t } = useTranslation('common');
  const dropdownPortalProps = useOverlayDropdownPortalProps();

  return (
    <SidebarDropdownMenu items={dropdownMenu} portalProps={dropdownPortalProps}>
      <ActionIcon aria-label={t('more')} icon={MoreHorizontalIcon} size={'small'} />
    </SidebarDropdownMenu>
  );
});

export default Actions;
