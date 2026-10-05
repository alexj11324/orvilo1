import { AGENT_CHAT_TOPIC_URL } from '@orvilo/const';
import type { ChatTopicStatus } from '@orvilo/types';
import {
  Archive,
  ArchiveRestore,
  ExternalLink,
  Hash,
  Link2,
  LucideCopy,
  PanelTop,
  PencilLine,
  Share2,
  Star,
  Trash,
  Wand2,
} from 'lucide-react';
import { createElement, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { openRenameModal } from '@/components/RenameModal';
import { toast } from '@/components/toast';
import { isDesktop } from '@/const/version';
import { confirmRemoveTopic } from '@/features/DeleteTopicConfirm';
import type { SidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
import { openShareModal } from '@/features/ShareModal';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { useAppOrigin } from '@/hooks/useAppOrigin';
import { usePermission } from '@/hooks/usePermission';
import { useChatStore } from '@/store/chat';
import { useElectronStore } from '@/store/electron';
import { useGlobalStore } from '@/store/global';

interface UseDropdownMenuProps {
  agentId?: string;
  fav?: boolean;
  onClose: () => void;
  onDelete?: (topicId: string) => void;
  status?: ChatTopicStatus | null;
  topicId: string;
  topicTitle: string;
}

export const useDropdownMenu = ({
  agentId,
  fav,
  onClose,
  onDelete,
  status,
  topicId,
  topicTitle,
}: UseDropdownMenuProps): (() => SidebarMenuItems) => {
  const { t } = useTranslation(['common', 'topic']);

  const appOrigin = useAppOrigin();
  const navigate = useWorkspaceAwareNavigate();
  const activeWorkspaceSlug = useActiveWorkspaceSlug();
  const { allowed: canCreateTopic } = usePermission('create_content');
  const { allowed: canEditTopic } = usePermission('edit_own_content');

  const addTab = useElectronStore((s) => s.addTab);
  const openTopicInNewWindow = useGlobalStore((s) => s.openTopicInNewWindow);

  const [
    autoRenameTopicTitle,
    duplicateTopic,
    favoriteTopic,
    archiveTopic,
    removeTopic,
    unarchiveTopic,
    updateTopicTitle,
  ] = useChatStore((s) => [
    s.autoRenameTopicTitle,
    s.duplicateTopic,
    s.favoriteTopic,
    s.archiveTopic,
    s.removeTopic,
    s.unarchiveTopic,
    s.updateTopicTitle,
  ]);

  const isArchived = status === 'archived';
  const handleOpenShareModal = useCallback(() => {
    void openShareModal({ context: { threadId: null, topicId } });
  }, [topicId]);

  return useCallback(
    () =>
      [
        {
          disabled: !canEditTopic,
          icon: createElement(isArchived ? ArchiveRestore : Archive),
          key: 'archive',
          label: isArchived
            ? t('actions.unarchive', { ns: 'topic' })
            : t('actions.archive', { ns: 'topic' }),
          onClick: () => {
            if (isArchived) {
              unarchiveTopic(topicId);
            } else {
              archiveTopic(topicId);
            }
          },
          sfSymbol: isArchived ? 'tray.and.arrow.up' : 'archivebox',
        },
        {
          type: 'divider' as const,
        },
        {
          disabled: !canEditTopic,
          icon: <Star />,
          key: 'favorite',
          label: fav
            ? t('actions.unfavorite', { ns: 'topic' })
            : t('actions.favorite', { ns: 'topic' }),
          onClick: () => {
            favoriteTopic(topicId, !fav);
          },
          sfSymbol: fav ? 'star.slash' : 'star',
        },
        {
          type: 'divider' as const,
        },
        {
          disabled: !canEditTopic,
          icon: <Wand2 />,
          key: 'autoRename',
          label: t('actions.autoRename', { ns: 'topic' }),
          onClick: () => {
            autoRenameTopicTitle(topicId);
          },
          sfSymbol: 'wand.and.stars',
        },
        {
          disabled: !canEditTopic,
          icon: <PencilLine />,
          key: 'rename',
          label: t('rename'),
          onClick: () => {
            openRenameModal({
              defaultValue: topicTitle,
              description: t('renameModal.description', { ns: 'topic' }),
              onSave: async (newTitle) => {
                await updateTopicTitle(topicId, newTitle);
              },
              title: t('renameModal.title', { ns: 'topic' }),
            });
          },
          sfSymbol: 'pencil',
        },
        {
          type: 'divider' as const,
        },
        ...(isDesktop
          ? [
              {
                disabled: !agentId,
                icon: <PanelTop />,
                key: 'openInNewTab',
                label: t('actions.openInNewTab', { ns: 'topic' }),
                onClick: () => {
                  if (!agentId) return;
                  const url = buildWorkspaceAwarePath(
                    AGENT_CHAT_TOPIC_URL(agentId, topicId),
                    activeWorkspaceSlug,
                  );
                  addTab(url);
                  navigate(url, { escape: true });
                  onClose();
                },
              },
              {
                disabled: !agentId,
                icon: <ExternalLink />,
                key: 'openInNewWindow',
                label: t('actions.openInNewWindow', { ns: 'topic' }),
                onClick: () => {
                  if (!agentId) return;
                  openTopicInNewWindow(agentId, topicId);
                  onClose();
                },
              },
              {
                type: 'divider' as const,
              },
            ]
          : []),
        {
          icon: <Hash />,
          key: 'copySessionId',
          label: t('actions.copySessionId', { ns: 'topic' }),
          onClick: () => {
            void navigator.clipboard.writeText(topicId);
            toast.success(t('actions.copySessionIdSuccess', { ns: 'topic' }));
          },
        },
        {
          disabled: !agentId,
          icon: <Link2 />,
          key: 'copyLink',
          label: t('actions.copyLink', { ns: 'topic' }),
          onClick: () => {
            if (!agentId) return;
            const url = `${appOrigin}${AGENT_CHAT_TOPIC_URL(agentId, topicId)}`;
            void navigator.clipboard.writeText(url);
            toast.success(t('actions.copyLinkSuccess', { ns: 'topic' }));
          },
        },
        {
          disabled: !canCreateTopic,
          icon: <LucideCopy />,
          key: 'duplicate',
          label: t('actions.duplicate', { ns: 'topic' }),
          onClick: () => {
            duplicateTopic(topicId);
          },
        },
        {
          type: 'divider' as const,
        },
        {
          disabled: !canEditTopic,
          icon: <Share2 />,
          key: 'share',
          label: t('share'),
          onClick: handleOpenShareModal,
          sfSymbol: 'square.and.arrow.up',
        },
        {
          type: 'divider' as const,
        },
        {
          danger: true,
          disabled: !canEditTopic,
          icon: <Trash />,
          key: 'delete',
          label: t('delete'),
          onClick: () => {
            void confirmRemoveTopic({
              onConfirm: async (removeFiles) => {
                await removeTopic(topicId, removeFiles);
                onDelete?.(topicId);
                onClose();
              },
              topicIds: [topicId],
            });
          },
          sfSymbol: 'trash',
        },
      ].filter(Boolean) as SidebarMenuItems,
    [
      addTab,
      activeWorkspaceSlug,
      agentId,
      appOrigin,
      autoRenameTopicTitle,
      canCreateTopic,
      canEditTopic,
      duplicateTopic,
      favoriteTopic,
      fav,
      handleOpenShareModal,
      isArchived,
      archiveTopic,
      navigate,
      onClose,
      onDelete,
      openTopicInNewWindow,
      removeTopic,
      t,
      topicId,
      topicTitle,
      unarchiveTopic,
      updateTopicTitle,
    ],
  );
};
