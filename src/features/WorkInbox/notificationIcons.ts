import type { NotificationFeedCard } from '@orvilo/types';
import {
  ArrowLeftRightIcon,
  AtSignIcon,
  BellIcon,
  CircleUserRoundIcon,
  GitPullRequestIcon,
  KeyRoundIcon,
  type LucideIcon,
} from 'lucide-react';

/* Notification-type glyph is the fallback for system events — human and
   agent senders render their snapshotted avatar instead (feed card actor). */
export const INBOX_TYPE_ICON: Record<string, LucideIcon> = {
  acp_permission: KeyRoundIcon,
  mention: AtSignIcon,
  resource_transfer: ArrowLeftRightIcon,
  task_assigned: CircleUserRoundIcon,
  workspace_ownership_transfer: ArrowLeftRightIcon,
};

export const inboxCardIcon = (card: NotificationFeedCard): LucideIcon => {
  if (card.type.includes('review')) return GitPullRequestIcon;
  return INBOX_TYPE_ICON[card.type] ?? BellIcon;
};
