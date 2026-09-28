'use client';

import { Icon } from '@lobehub/ui';
import { ActionIcon, type DropdownItem, DropdownMenu, Text } from '@lobehub/ui/base-ui';
import { MoreHorizontalIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import { INBOX_HEADER_MENU, type InboxHeaderMenuItemKey } from './inboxHeaderMenuModel';

interface InboxHeaderMenuProps {
  /** `archive` bulk — labelled "Delete all" to match the reference. */
  onDeleteAll: () => void;
  /** `mark_read` bulk — also bound to ⌥U by the page. */
  onMarkAllRead: () => void;
}

/**
 * The inbox page-header `⋯` menu (Linear's "Notification actions"). Item set,
 * order and dividers come from `INBOX_HEADER_MENU`; this component only wires
 * icons, labels, the visible shortcut hint and the real handlers.
 */
const InboxHeaderMenu = memo(({ onDeleteAll, onMarkAllRead }: InboxHeaderMenuProps) => {
  const { t } = useTranslation('notification');
  const navigate = useWorkspaceAwareNavigate();

  const items = useMemo<DropdownItem[]>(() => {
    const handlers: Record<InboxHeaderMenuItemKey, () => void> = {
      deleteAll: onDeleteAll,
      // Linear lands on account notification settings; the workspace-mirrored
      // tab is the same surface scoped to the active workspace.
      goToSettings: () => navigate('/settings/notification'),
      markAllRead: onMarkAllRead,
    };
    return INBOX_HEADER_MENU.map((entry) => {
      if (entry.type === 'divider') return { key: entry.key, type: 'divider' as const };
      return {
        extra: entry.shortcut ? (
          <Text fontSize={12} type={'secondary'}>
            {entry.shortcut}
          </Text>
        ) : undefined,
        icon: <Icon icon={entry.icon} />,
        key: entry.key,
        label: t(entry.labelKey as never),
        onClick: handlers[entry.key],
      };
    });
  }, [navigate, onDeleteAll, onMarkAllRead, t]);

  return (
    <DropdownMenu items={items} placement={'bottomRight'}>
      <ActionIcon icon={MoreHorizontalIcon} size={'small'} title={t('inbox.notificationActions')} />
    </DropdownMenu>
  );
});

InboxHeaderMenu.displayName = 'InboxHeaderMenu';

export default InboxHeaderMenu;
