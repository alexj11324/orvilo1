import { Archive, ArchiveRestore, MoreHorizontalIcon } from 'lucide-react';
import { memo, type MouseEvent, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useOverlayDropdownPortalProps } from '@/features/NavPanel/OverlayContainer';
import { usePermission } from '@/hooks/usePermission';
import { useChatStore } from '@/store/chat';

import { type TopicItemDropdownMenuProps, useTopicItemDropdownMenu } from './useDropdownMenu';

const sidebarActionSize = {
  blockSize: 24,
  borderRadius: 'var(--radius-button)',
  size: 16,
} as const;
const actionTarget =
  "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5 pointer-coarse:after:content-['']";
const actionWrapper = 'inline-flex flex-none pointer-coarse:p-2.5';

const Actions = memo<TopicItemDropdownMenuProps>(({ fav, id, status, title }) => {
  const { t } = useTranslation('topic');
  const { dropdownMenu } = useTopicItemDropdownMenu({ fav, id, status, title });
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
        <span className={actionWrapper}>
          <ActionIcon
            aria-label={isArchived ? t('actions.unarchive') : t('actions.archive')}
            className={actionTarget}
            icon={isArchived ? ArchiveRestore : Archive}
            size={sidebarActionSize}
            title={isArchived ? t('actions.unarchive') : t('actions.archive')}
            onClick={handleArchiveClick}
          />
        </span>
      )}
      <span className={actionWrapper}>
        <SidebarDropdownMenu items={dropdownMenu} portalProps={dropdownPortalProps}>
          <ActionIcon
            aria-label={t('more', { ns: 'common' })}
            className={actionTarget}
            icon={MoreHorizontalIcon}
            size={sidebarActionSize}
          />
        </SidebarDropdownMenu>
      </span>
    </>
  );
});

export default Actions;
