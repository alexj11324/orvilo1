'use client';
import { MoreHorizontalIcon } from 'lucide-react';
import { createElement, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import SidebarDropdownMenu, {
  type SidebarDropdownMenuProps,
} from '@/features/NavPanel/components/SidebarDropdownMenu';
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

  const items = useMemo<Exclude<SidebarDropdownMenuProps['items'], () => unknown>>(() => {
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
          <span className="text-sm text-muted-foreground">{entry.shortcut}</span>
        ) : undefined,
        icon: createElement(entry.icon, { className: 'size-4 shrink-0' }),
        key: entry.key,
        label: t(entry.labelKey as never),
        onClick: handlers[entry.key],
      };
    });
  }, [navigate, onDeleteAll, onMarkAllRead, t]);

  return (
    <SidebarDropdownMenu items={items} placement={'bottomRight'}>
      <Button
        aria-label={t('inbox.notificationActions')}
        size="icon"
        title={t('inbox.notificationActions')}
        variant="ghost"
      >
        {createElement(MoreHorizontalIcon, { className: 'size-4 shrink-0' })}
      </Button>
    </SidebarDropdownMenu>
  );
});

InboxHeaderMenu.displayName = 'InboxHeaderMenu';

export default InboxHeaderMenu;
