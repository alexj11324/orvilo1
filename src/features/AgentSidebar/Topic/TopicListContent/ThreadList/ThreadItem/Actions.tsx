import { MoreHorizontalIcon } from 'lucide-react';
import { memo } from 'react';

import ActionIcon from '@/components/ActionIcon';
import { type DropdownItem, DropdownMenu } from '@/components/ItemsMenu';
import { useOverlayDropdownPortalProps } from '@/features/NavPanel/OverlayContainer';

interface ActionProps {
  dropdownMenu: DropdownItem[] | (() => DropdownItem[]);
}

const Actions = memo<ActionProps>(({ dropdownMenu }) => {
  const dropdownPortalProps = useOverlayDropdownPortalProps();

  return (
    <DropdownMenu items={dropdownMenu} portalProps={dropdownPortalProps}>
      <ActionIcon icon={MoreHorizontalIcon} size={'small'} />
    </DropdownMenu>
  );
});

export default Actions;
