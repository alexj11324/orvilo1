import { GROUP_CHAT_TOPIC_URL } from '@orvilo/const';
import type { ChatTopicStatus } from '@orvilo/types';
import {
  Archive,
  ArchiveRestore,
  ExternalLink,
  Hash,
  Link2,
  PanelTop,
  PencilLine,
  Trash,
  Wand2,
} from 'lucide-react';
import { createElement, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { toast } from '@/components/toast';
import { isDesktop } from '@/const/version';
import { confirmRemoveTopic } from '@/features/DeleteTopicConfirm';
import type { SidebarMenuItemData } from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { useAppOrigin } from '@/hooks/useAppOrigin';
import { usePermission } from '@/hooks/usePermission';
import { useAgentGroupStore } from '@/store/agentGroup';
import { useChatStore } from '@/store/chat';
import { useElectronStore } from '@/store/electron';
import { useGlobalStore } from '@/store/global';

interface TopicItemDropdownMenuProps {
  id?: string;
  status?: ChatTopicStatus | null;
  toggleEditing: (visible?: boolean) => void;
}

export const useTopicItemDropdownMenu = ({
  id,
  status,
  toggleEditing,
}: TopicItemDropdownMenuProps): (() => SidebarMenuItemData[]) => {
  const { t } = useTranslation(['topic', 'common']);

  const navigate = useWorkspaceAwareNavigate();
  const activeWorkspaceSlug = useActiveWorkspaceSlug();
  const { allowed: canEditTopic } = usePermission('edit_own_content');

  const openGroupTopicInNewWindow = useGlobalStore((s) => s.openGroupTopicInNewWindow);
  const activeGroupId = useAgentGroupStore((s) => s.activeGroupId);
  const addTab = useElectronStore((s) => s.addTab);
  const appOrigin = useAppOrigin();

  const [autoRenameTopicTitle, removeTopic, archiveTopic, unarchiveTopic] = useChatStore((s) => [
    s.autoRenameTopicTitle,
    s.removeTopic,
    s.archiveTopic,
    s.unarchiveTopic,
  ]);

  const isArchived = status === 'archived';

  return useCallback(() => {
    if (!id) return [];

    return [
      {
        disabled: !canEditTopic,
        icon: createElement(isArchived ? ArchiveRestore : Archive, {}),
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
          toggleEditing(true);
        },
        sfSymbol: 'pencil',
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
                if (!activeGroupId) return;
                const url = buildWorkspaceAwarePath(
                  GROUP_CHAT_TOPIC_URL(activeGroupId, id),
                  activeWorkspaceSlug,
                );
                addTab(url);
                navigate(url, { escape: true });
              },
            },
            {
              icon: <ExternalLink />,
              key: 'openInNewWindow',
              label: t('actions.openInNewWindow'),
              onClick: () => {
                if (activeGroupId) openGroupTopicInNewWindow(activeGroupId, id);
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
        label: t('actions.copySessionId'),
        onClick: () => {
          navigator.clipboard.writeText(id);
          toast.success(t('actions.copySessionIdSuccess'));
        },
      },
      {
        icon: <Link2 />,
        key: 'copyLink',
        label: t('actions.copyLink'),
        onClick: () => {
          if (!activeGroupId) return;
          const url = `${appOrigin}${GROUP_CHAT_TOPIC_URL(activeGroupId, id)}`;
          navigator.clipboard.writeText(url);
          toast.success(t('actions.copyLinkSuccess'));
        },
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
              await removeTopic(id, removeFiles);
            },
            topicIds: [id],
          });
        },
        sfSymbol: 'trash',
      },
    ].filter(Boolean) as SidebarMenuItemData[];
  }, [
    id,
    isArchived,
    canEditTopic,
    activeGroupId,
    activeWorkspaceSlug,
    appOrigin,
    autoRenameTopicTitle,
    archiveTopic,
    unarchiveTopic,
    removeTopic,
    openGroupTopicInNewWindow,
    addTab,
    navigate,
    toggleEditing,
    t,
  ]);
};
