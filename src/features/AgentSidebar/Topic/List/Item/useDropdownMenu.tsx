import { AGENT_CHAT_TOPIC_URL } from '@orvilo/const';
import type { ChatTopicStatus } from '@orvilo/types';
import {
  Archive,
  ArchiveRestore,
  Download,
  ExternalLink,
  FolderInput,
  Forward,
  Hash,
  Link2,
  LucideCopy,
  PanelRight,
  PanelTop,
  PencilLine,
  Star,
  Stethoscope,
  Trash,
  Wand2,
} from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { openRenameModal } from '@/components/RenameModal';
import { toast } from '@/components/toast';
import { isDesktop } from '@/const/version';
import { createTopicForwardModal } from '@/features/Conversation/MessageForward/TopicForwardModal';
import { confirmRemoveTopic } from '@/features/DeleteTopicConfirm';
import { createMoveTopicsModal } from '@/features/MoveTopicsModal';
import { type SidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
import { openShareModal } from '@/features/ShareModal';
import { openTopicDoctorModal } from '@/features/TopicDoctorModal';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { useAppOrigin } from '@/hooks/useAppOrigin';
import { usePermission } from '@/hooks/usePermission';
import { useAgentStore } from '@/store/agent';
import { useChatStore } from '@/store/chat';
import { useElectronStore } from '@/store/electron';
import { useGlobalStore } from '@/store/global';
import { copyToClipboard } from '@/utils/clipboard';
import { isForbiddenError } from '@/utils/forbiddenError';

export interface TopicItemDropdownMenuProps {
  fav?: boolean;
  id?: string;
  status?: ChatTopicStatus | null;
  title: string;
}

export const useTopicItemDropdownMenu = ({
  fav,
  id,
  status,
  title,
}: TopicItemDropdownMenuProps) => {
  const { t } = useTranslation(['topic', 'common', 'chat']);

  const navigate = useWorkspaceAwareNavigate();
  const activeWorkspaceSlug = useActiveWorkspaceSlug();
  const { allowed: canCreateTopic } = usePermission('create_content');
  const { allowed: canEditTopic } = usePermission('edit_own_content');

  const openTopicInNewWindow = useGlobalStore((s) => s.openTopicInNewWindow);
  const openTopicInPortal = useChatStore((s) => s.openTopicInPortal);
  const activeAgentId = useAgentStore((s) => s.activeAgentId);
  const addTab = useElectronStore((s) => s.addTab);
  const appOrigin = useAppOrigin();

  const [
    autoRenameTopicTitle,
    duplicateTopic,
    removeTopic,
    favoriteTopic,
    archiveTopic,
    unarchiveTopic,
    updateTopicTitle,
  ] = useChatStore((s) => [
    s.autoRenameTopicTitle,
    s.duplicateTopic,
    s.removeTopic,
    s.favoriteTopic,
    s.archiveTopic,
    s.unarchiveTopic,
    s.updateTopicTitle,
  ]);

  const isArchived = status === 'archived';
  const handleOpenShareModal = useCallback(() => {
    if (!id) return;

    void openShareModal({ context: { threadId: null, topicId: id } });
  }, [id]);

  const dropdownMenu = useCallback(() => {
    if (!id) return [];

    return [
      {
        disabled: !canEditTopic,
        icon: isArchived ? <ArchiveRestore /> : <Archive />,
        key: 'archive',
        label: isArchived ? t('actions.unarchive') : t('actions.archive'),
        onClick: () => {
          if (isArchived) {
            unarchiveTopic(id);
          } else {
            archiveTopic(id);
          }
        },
        sfSymbol: isArchived ? 'tray.and.arrow.up' : 'archivebox',
      },
      {
        disabled: !canEditTopic,
        icon: <Star />,
        key: 'favorite',
        label: fav ? t('actions.unfavorite') : t('actions.favorite'),
        onClick: () => {
          favoriteTopic(id, !fav);
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
        label: t('actions.autoRename'),
        onClick: () => {
          autoRenameTopicTitle(id);
        },
        sfSymbol: 'wand.and.stars',
      },
      {
        disabled: !canEditTopic,
        icon: <PencilLine />,
        key: 'rename',
        label: t('rename', { ns: 'common' }),
        onClick: () => {
          openRenameModal({
            defaultValue: title,
            description: t('renameModal.description', { ns: 'topic' }),
            onSave: async (newTitle) => {
              try {
                await updateTopicTitle(id, newTitle);
              } catch (error) {
                toast.error(
                  isForbiddenError(error)
                    ? t('manageOnlyCreator', { ns: 'common' })
                    : t('operationFailed', { ns: 'common' }),
                );
              }
            },
            title: t('renameModal.title', { ns: 'topic' }),
          });
        },
        sfSymbol: 'pencil',
      },
      {
        disabled: !canEditTopic,
        icon: <Stethoscope />,
        key: 'diagnose',
        label: t('actions.diagnose'),
        onClick: () => {
          openTopicDoctorModal({ agentId: activeAgentId, topicId: id });
        },
        sfSymbol: 'stethoscope',
      },
      {
        type: 'divider' as const,
      },
      ...(isDesktop
        ? [
            {
              icon: <PanelTop />,
              key: 'openInNewTab',
              label: t('actions.openInNewTab'),
              onClick: () => {
                if (!activeAgentId) return;
                const url = buildWorkspaceAwarePath(
                  AGENT_CHAT_TOPIC_URL(activeAgentId, id),
                  activeWorkspaceSlug,
                );
                addTab(url);
                navigate(url, { escape: true });
              },
            },
          ]
        : []),
      {
        icon: <PanelRight />,
        key: 'openOnRight',
        label: t('openOnRight', { ns: 'common' }),
        onClick: () => {
          openTopicInPortal(id);
        },
      },
      ...(isDesktop
        ? [
            {
              icon: <ExternalLink />,
              key: 'openInNewWindow',
              label: t('actions.openInNewWindow'),
              onClick: () => {
                if (activeAgentId) openTopicInNewWindow(activeAgentId, id);
              },
            },
            {
              type: 'divider' as const,
            },
          ]
        : [{ type: 'divider' as const }]),
      {
        icon: <Hash />,
        key: 'copySessionId',
        label: t('actions.copySessionId'),
        onClick: async () => {
          await copyToClipboard(id);
          toast.success(t('actions.copySessionIdSuccess'));
        },
      },
      {
        icon: <Link2 />,
        key: 'copyLink',
        label: t('actions.copyLink'),
        onClick: async () => {
          if (!activeAgentId) return;
          const url = `${appOrigin}${AGENT_CHAT_TOPIC_URL(activeAgentId, id)}`;
          await copyToClipboard(url);
          toast.success(t('actions.copyLinkSuccess'));
        },
      },
      {
        type: 'divider' as const,
      },
      {
        disabled: !canCreateTopic,
        icon: <LucideCopy />,
        key: 'duplicate',
        label: t('actions.duplicate'),
        onClick: () => {
          duplicateTopic(id);
        },
      },
      {
        disabled: !canCreateTopic || !activeAgentId,
        icon: <Forward />,
        key: 'forwardToAgent',
        label: t('actions.forwardToAgent'),
        onClick: () => {
          if (!activeAgentId) return;
          createTopicForwardModal({ sourceAgentId: activeAgentId, topicId: id, topicTitle: title });
        },
      },
      {
        disabled: !canEditTopic,
        icon: <FolderInput />,
        key: 'moveToAgent',
        label: t('actions.moveToAgent'),
        onClick: () => {
          createMoveTopicsModal({ sourceAgentId: activeAgentId, topicIds: [id] });
        },
      },
      {
        type: 'divider' as const,
      },
      {
        disabled: !canEditTopic,
        icon: <Download />,
        key: 'share',
        label: t('shareModal.title', { ns: 'chat' }),
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
        label: t('delete', { ns: 'common' }),
        onClick: () => {
          void confirmRemoveTopic({
            onConfirm: async (removeFiles) => {
              try {
                await removeTopic(id, removeFiles);
              } catch (error) {
                toast.error(
                  isForbiddenError(error)
                    ? t('manageOnlyCreator', { ns: 'common' })
                    : t('operationFailed', { ns: 'common' }),
                );
              }
            },
            topicIds: [id],
          });
        },
        sfSymbol: 'trash',
      },
    ].filter(Boolean) as SidebarMenuItems;
  }, [
    id,
    fav,
    isArchived,
    title,
    canCreateTopic,
    canEditTopic,
    activeAgentId,
    activeWorkspaceSlug,
    appOrigin,
    archiveTopic,
    unarchiveTopic,
    autoRenameTopicTitle,
    duplicateTopic,
    favoriteTopic,
    removeTopic,
    updateTopicTitle,
    openTopicInNewWindow,
    openTopicInPortal,
    addTab,
    navigate,
    t,
    handleOpenShareModal,
  ]);
  return { dropdownMenu };
};
