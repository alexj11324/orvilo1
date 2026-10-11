import type { SidebarAgentItem } from '@orvilo/types';
import { agentDisplayName, agentSecondaryDisplayName } from '@orvilo/types';
import { Loader2, PinIcon } from 'lucide-react';
import { type CSSProperties, type DragEvent } from 'react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import NavItem from '@/features/NavPanel/components/NavItem';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { usePrefetchAgent } from '@/hooks/usePrefetchAgent';
import { useChatStore } from '@/store/chat';
import { operationSelectors } from '@/store/chat/selectors';
import { useGlobalStore } from '@/store/global';
import { useHomeStore } from '@/store/home';

import { useAgentModal } from '../../ModalProvider';
import Actions from '../Item/Actions';
import { usePreservedAgentUrl } from '../usePreservedAgentUrl';
import Avatar from './Avatar';
import { useAgentDropdownMenu } from './useDropdownMenu';

const styles = {
  badge:
    'pointer-events-none absolute -inset-be-1 -end-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full border-[length:calc(var(--spacing)*0.375)] border-card px-1 text-xs leading-5 font-semibold text-destructive-on-fill bg-destructive',
  runningBadge:
    'pointer-events-none absolute -inset-be-1 -end-1 inline-flex size-5 items-center justify-center rounded-full border-[length:calc(var(--spacing)*0.375)] border-card bg-card text-warning-text',
  wrapper: 'relative inline-flex',
};

interface AgentItemProps {
  className?: string;
  item: SidebarAgentItem;
  onNavigate?: () => void;
  secondaryLabel?: string | null;
  style?: CSSProperties;
}

const AgentItem = memo<AgentItemProps>(({ item, style, className, onNavigate, secondaryLabel }) => {
  const { avatar, backgroundColor, id, heterogeneousType, pinned, slug, userId, visibility } = item;
  // Unread count is server-computed (topics.status === 'unread') and carried on
  // the sidebar list item, so it stays accurate across agents whose topics
  // aren't loaded into the chat store on this client.
  const unreadCount = item.unreadCount ?? 0;
  const { t } = useTranslation('chat');
  const { openCreateGroupModal } = useAgentModal();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const openAgentInNewWindow = useGlobalStore((s) => s.openAgentInNewWindow);

  const prefetchAgent = usePrefetchAgent();
  const isUpdating = useHomeStore((s) => s.agentUpdatingId === id);

  // Separate loading state from chat store - only show loading for this specific agent
  const isLoading = useChatStore(operationSelectors.isAgentVisiblyRunning(id));

  // Name-first label with fallback (see agentDisplayName)
  const displayTitle = agentDisplayName(item, t('untitledAgent'));
  // The role shown beside the name — same rule for every agent, heterogeneous
  // ones included (see agentSecondaryDisplayName).
  const roleTag = secondaryLabel || agentSecondaryDisplayName(item);

  const agentUrl = usePreservedAgentUrl(id);

  // Memoize event handlers
  const handleMouseEnter = useCallback(() => {
    prefetchAgent(id);
  }, [id, prefetchAgent]);

  const handleDoubleClick = useCallback(() => {
    openAgentInNewWindow(id);
  }, [id, openAgentInNewWindow]);

  const handleDragStart = useCallback(
    (e: DragEvent) => {
      e.dataTransfer.setData('text/plain', id);
    },
    [id],
  );

  const handleDragEnd = useCallback(
    (e: DragEvent) => {
      if (e.dataTransfer.dropEffect === 'none') {
        openAgentInNewWindow(id);
      }
    },
    [id, openAgentInNewWindow],
  );

  const handleOpenCreateGroupModal = useCallback(() => {
    openCreateGroupModal(id, visibility);
  }, [id, openCreateGroupModal, visibility]);

  // Memoize pin icon
  const pinIcon = useMemo(
    () => (pinned ? <PinIcon className="pointer-events-none opacity-50" size={16} /> : undefined),
    [pinned],
  );

  // Memoize avatar icon (show loader when updating, running spinner or unread badge at bottom-right)
  const avatarIcon = useMemo(() => {
    if (isUpdating) {
      return <Loader2 className="animate-spin text-foreground-description" size={16} />;
    }

    const avatarNode = <Avatar type={heterogeneousType} />;

    if (isLoading) {
      return (
        <span className={styles.wrapper}>
          {avatarNode}
          <span className={styles.runningBadge}>
            <Loader2 className="animate-spin" size={16} />
          </span>
        </span>
      );
    }

    if (unreadCount > 0) {
      return (
        <span className={styles.wrapper}>
          {avatarNode}
          <span className={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
        </span>
      );
    }

    return avatarNode;
  }, [isUpdating, isLoading, heterogeneousType, unreadCount]);

  const dropdownMenu = useAgentDropdownMenu({
    anchor,
    avatar: typeof avatar === 'string' ? avatar : undefined,
    backgroundColor: backgroundColor || undefined,
    group: undefined, // TODO: pass group from parent if needed
    id,
    openCreateGroupModal: handleOpenCreateGroupModal,
    pinned: pinned ?? false,
    slug,
    title: displayTitle,
    userId,
    visibility,
  });

  return (
    <WorkspaceLink
      aria-label={displayTitle}
      ref={setAnchor}
      to={agentUrl}
      onClick={onNavigate}
      onMouseEnter={handleMouseEnter}
    >
      <NavItem
        actions={<Actions dropdownMenu={dropdownMenu} />}
        className={className}
        contextMenuItems={dropdownMenu}
        disabled={isUpdating}
        draggable={!isUpdating}
        extra={pinIcon}
        icon={avatarIcon}
        key={id}
        style={style}
        title={
          roleTag ? (
            <>
              {displayTitle}
              <span className="ms-1.5 text-xs leading-5 opacity-60">{roleTag}</span>
            </>
          ) : (
            displayTitle
          )
        }
        onDoubleClick={handleDoubleClick}
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
      />
    </WorkspaceLink>
  );
});

export default AgentItem;
