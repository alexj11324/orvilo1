import { CheckCheckIcon, type LucideIcon, SettingsIcon, Trash2Icon } from 'lucide-react';

/**
 * Inbox page-header `⋯` menu model — Linear's "Notification actions" menu,
 * captured 2026-09-23 (docs/research/linear/ref-2026-09-23/ref-inbox-menu.png):
 *
 *   1. Mark all as read          ⌥U
 *   ─ divider
 *   2. Delete all
 *   3. Delete all read           ⇧⌫
 *   4. Delete all completed
 *   ─ divider
 *   5. Go to settings            → /settings/account/notifications
 *
 * Backend coverage (notification bulk API = `archive` | `mark_read`, and the
 * prepared fingerprint only admits all|archived|mentions|snoozed|unread):
 *   - "Delete all" maps to the archive bulk — the nearest real capability.
 *     Archived cards stay recoverable under the Archived filter, so the label
 *     matches the reference while the operation remains truthful.
 *   - "Delete all read" needs a `read` bulk filter that does not exist, and
 *     "Delete all completed" needs a completed-state concept the feed lacks —
 *     both are omitted rather than rendered dead.
 *   - "Go to settings" resolves to the workspace-mirrored
 *     `/settings/notification` tab.
 */

export type InboxHeaderMenuItemKey = 'deleteAll' | 'goToSettings' | 'markAllRead';

export type InboxHeaderMenuEntry =
  | { key: string; type: 'divider' }
  | {
      icon: LucideIcon;
      key: InboxHeaderMenuItemKey;
      /** i18n key inside the `notification` namespace. */
      labelKey: string;
      /** Visible hint; set only when the page actually binds the hotkey. */
      shortcut?: string;
      type: 'item';
    };

export const INBOX_HEADER_MENU: readonly InboxHeaderMenuEntry[] = [
  {
    icon: CheckCheckIcon,
    key: 'markAllRead',
    labelKey: 'inbox.markAllRead',
    shortcut: '⌥U',
    type: 'item',
  },
  { key: 'divider-read', type: 'divider' },
  { icon: Trash2Icon, key: 'deleteAll', labelKey: 'inbox.deleteAll', type: 'item' },
  { key: 'divider-settings', type: 'divider' },
  { icon: SettingsIcon, key: 'goToSettings', labelKey: 'inbox.goToSettings', type: 'item' },
];
