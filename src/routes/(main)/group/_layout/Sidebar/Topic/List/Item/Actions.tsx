import type { ChatTopicStatus } from '@orvilo/types';
import { Archive, ArchiveRestore, MoreHorizontalIcon } from 'lucide-react';
import { memo, type MouseEvent, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import type { SidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useOverlayDropdownPortalProps } from '@/features/NavPanel/OverlayContainer';
import { usePermission } from '@/hooks/usePermission';
import { useChatStore } from '@/store/chat';

interface ActionProps {
  dropdownMenu: SidebarMenuItems | (() => SidebarMenuItems);
  id?: string;
  status?: ChatTopicStatus | null;
}

const Actions = memo<ActionProps>(({ dropdownMenu, id, status }) => {
  const { t } = useTranslation('topic');
  const dropdownPortalProps = useOverlayDropdownPortalProps();
  const { allowed: canEditTopic } = usePermission('edit_own_content');

  const isArchived = status === 'archived';
  const [archiveTopic, unarchiveTopic] = useChatStore((s) => [s.archiveTopic, s.unarchiveTopic]);

  const handleArchiveClick = useCallback(
    (event: MouseEvent) => {
      // The row's own click navigates — the archive affordance must not.
      event.stopPropagation();
      event.preventDefault();
      if (!id) return;
      if (isArchived) {
        void unarchiveTopic(id);
      } else {
        void archiveTopic(id);
      }
    },
    [id, isArchived, archiveTopic, unarchiveTopic],
  );

  return (
    <>
      {id && canEditTopic && (
        <ActionIcon
          aria-label={isArchived ? t('actions.unarchive') : t('actions.archive')}
          icon={isArchived ? ArchiveRestore : Archive}
          size={'small'}
          title={isArchived ? t('actions.unarchive') : t('actions.archive')}
          onClick={handleArchiveClick}
        />
      )}
      <SidebarDropdownMenu items={dropdownMenu} portalProps={dropdownPortalProps}>
        <ActionIcon
          aria-label={t('more', { ns: 'common' })}
          icon={MoreHorizontalIcon}
          size={'small'}
        />
      </SidebarDropdownMenu>
    </>
  );
});

export default Actions;
