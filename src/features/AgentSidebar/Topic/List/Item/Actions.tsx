import { MoreHorizontalIcon } from 'lucide-react';
import { memo } from 'react';

import ActionIcon from '@/components/ActionIcon';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useOverlayDropdownPortalProps } from '@/features/NavPanel/OverlayContainer';

import { type TopicItemDropdownMenuProps, useTopicItemDropdownMenu } from './useDropdownMenu';

const Actions = memo<TopicItemDropdownMenuProps>(({ fav, id, status, title }) => {
  const { dropdownMenu } = useTopicItemDropdownMenu({ fav, id, status, title });
  const dropdownPortalProps = useOverlayDropdownPortalProps();

  return (
    <SidebarDropdownMenu items={dropdownMenu} portalProps={dropdownPortalProps}>
      <ActionIcon icon={MoreHorizontalIcon} size={'small'} />
    </SidebarDropdownMenu>
  );
});

export default Actions;
