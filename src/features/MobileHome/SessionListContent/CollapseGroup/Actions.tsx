import { MoreVertical, PencilLine, Plus, Settings2, Trash, UsersRound } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { MemberSelectionModal } from '@/components/MemberSelectionModal';
import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import type {
  SidebarDropdownMenuProps,
  SidebarMenuItemData,
} from '@/features/NavPanel/components/SidebarDropdownMenu';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useAgentGroupStore } from '@/store/agentGroup';
import { useSessionStore } from '@/store/session';

interface ActionsProps extends Pick<SidebarDropdownMenuProps, 'onOpenChange'> {
  id?: string;
  isCustomGroup?: boolean;
  isPinned?: boolean;
  openConfigModal: () => void;
  openRenameModal?: () => void;
}

const Actions = memo<ActionsProps>(
  ({ id, openRenameModal, openConfigModal, onOpenChange, isCustomGroup, isPinned }) => {
    const { t } = useTranslation(['chat', 'common']);

    const isMobile = useIsMobile();
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);

    const [createSession, removeSessionGroup] = useSessionStore((s) => [
      s.createSession,
      s.removeSessionGroup,
    ]);

    const [createGroup] = useAgentGroupStore((s) => [s.createGroup]);

    const sessionGroupConfigPublicItem: SidebarMenuItemData = {
      icon: <Settings2 size={14} />,
      key: 'config',
      label: t('sessionGroup.config'),
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        openConfigModal();
      },
    };

    const newAgentPublicItem: SidebarMenuItemData = {
      icon: <Plus size={14} />,
      key: 'newAgent',
      label: t('newAgent'),
      onClick: async ({ domEvent }) => {
        domEvent.stopPropagation();
        const creatingToast = toast.loading(t('sessionGroup.creatingAgent'));

        await createSession({ group: id, pinned: isPinned });

        creatingToast.close();
        toast.success(t('sessionGroup.createAgentSuccess'));
      },
    };

    const newGroupChatItem: SidebarMenuItemData = {
      icon: <UsersRound size={14} />,
      key: 'newGroupChat',
      label: t('newGroupChat'),
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        setIsGroupModalOpen(true);
      },
    };

    const handleCreateGroupWithMembers = async (
      selectedAgents: string[],
      hostConfig?: { model?: string; provider?: string },
      enableSupervisor?: boolean,
    ) => {
      try {
        setIsCreatingGroup(true);

        const config: any = {};

        if (enableSupervisor !== undefined) {
          config.enableSupervisor = enableSupervisor;
        }

        if (hostConfig) {
          config.orchestratorModel = hostConfig.model;
          config.orchestratorProvider = hostConfig.provider;
        }

        await createGroup(
          {
            config: Object.keys(config).length > 0 ? config : undefined,
            title: 'New Group Chat',
          },
          selectedAgents,
        );
        setIsGroupModalOpen(false);
      } catch (error) {
        console.error('Failed to create group:', error);
        toast.error(t('sessionGroup.createGroupFailed'));
      } finally {
        setIsCreatingGroup(false);
      }
    };

    const handleGroupModalCancel = () => {
      setIsGroupModalOpen(false);
    };

    const customGroupItems: SidebarMenuItemData[] = [
      {
        icon: <PencilLine size={14} />,
        key: 'rename',
        label: t('sessionGroup.rename'),
        onClick: ({ domEvent }) => {
          domEvent.stopPropagation();
          openRenameModal?.();
        },
      },
      sessionGroupConfigPublicItem,
      {
        type: 'divider',
      },
      {
        danger: true,
        icon: <Trash size={14} />,
        key: 'delete',
        label: t('delete', { ns: 'common' }),
        onClick: ({ domEvent }) => {
          domEvent.stopPropagation();
          confirmModal({
            cancelText: t('cancel', { ns: 'common' }),
            content: t('sessionGroup.confirmRemoveGroupAlert'),
            okButtonProps: { danger: true },
            okText: t('delete', { ns: 'common' }),
            onOk: async () => {
              if (!id) return;
              await removeSessionGroup(id);
            },
            title: t('delete', { ns: 'common' }),
          });
        },
      },
    ];

    const menuItems: SidebarMenuItemData[] = [
      newAgentPublicItem,
      newGroupChatItem,
      { type: 'divider' },
      ...(isCustomGroup ? customGroupItems : [sessionGroupConfigPublicItem]),
    ];

    return (
      <>
        <SidebarDropdownMenu items={menuItems} onOpenChange={onOpenChange}>
          <ActionIcon
            active={isMobile ? true : false}
            icon={MoreVertical}
            loading={isCreatingGroup}
            size={{ blockSize: 22, size: 16 }}
            style={{ background: isMobile ? 'transparent' : '', marginRight: -8 }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          />
        </SidebarDropdownMenu>

        <MemberSelectionModal
          mode="create"
          open={isGroupModalOpen}
          onCancel={handleGroupModalCancel}
          onConfirm={handleCreateGroupWithMembers}
        />
      </>
    );
  },
);

export default Actions;
