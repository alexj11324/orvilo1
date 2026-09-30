import { createStaticStyles } from 'antd-style';
import { MoreVertical, PencilLine, Plus, Settings2, Trash, UsersRound } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { MemberSelectionModal } from '@/components/MemberSelectionModal';
import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import SidebarDropdownMenu, {
  type SidebarDropdownMenuProps,
} from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useAgentGroupStore } from '@/store/agentGroup';
import { useSessionStore } from '@/store/session';

const styles = createStaticStyles(({ css }) => ({
  modalRoot: css`
    z-index: 2000;
  `,
}));
interface ActionsProps extends Pick<SidebarDropdownMenuProps, 'onOpenChange'> {
  id?: string;
  isCustomGroup?: boolean;
  isPinned?: boolean;
  openConfigModal: () => void;
  openRenameModal?: () => void;
}

type MenuItemType = Exclude<SidebarDropdownMenuProps['items'], () => unknown>[number];

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

    const sessionGroupConfigPublicItem: MenuItemType = {
      icon: <Settings2 size={14} />,
      key: 'config',
      label: t('sessionGroup.config'),
      onClick: ({ domEvent }: any) => {
        domEvent.stopPropagation();
        openConfigModal();
      },
    };

    const newAgentPublicItem: MenuItemType = {
      icon: <Plus size={14} />,
      key: 'newAgent',
      label: t('newAgent'),
      onClick: async ({ domEvent }: any) => {
        domEvent.stopPropagation();
        const creatingToast = toast.loading(t('sessionGroup.creatingAgent'));

        await createSession({ group: id, pinned: isPinned });

        creatingToast.close();
        toast.success(t('sessionGroup.createAgentSuccess'));
      },
    };

    const newGroupChatItem: MenuItemType = {
      icon: <UsersRound size={14} />,
      key: 'newGroupChat',
      label: t('newGroupChat'),
      onClick: ({ domEvent }: any) => {
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

    const customGroupItems: Exclude<SidebarDropdownMenuProps['items'], () => unknown> = useMemo(
      () => [
        {
          icon: <PencilLine size={14} />,
          key: 'rename',
          label: t('sessionGroup.rename'),
          onClick: ({ domEvent }: any) => {
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
          onClick: ({ domEvent }: any) => {
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
      ],
      [],
    );

    const defaultItems: Exclude<SidebarDropdownMenuProps['items'], () => unknown> = useMemo(
      () => [sessionGroupConfigPublicItem],
      [],
    );

    const tailItems = useMemo(
      () => (isCustomGroup ? customGroupItems : defaultItems),
      [isCustomGroup, customGroupItems, defaultItems],
    );

    const menuItems = useMemo(() => {
      return [newAgentPublicItem, newGroupChatItem, { type: 'divider' as const }, ...tailItems];
    }, [newAgentPublicItem, newGroupChatItem, tailItems]);

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
