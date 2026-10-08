import type { SFSymbol } from '@orvilo/electron-client-ipc';
import { FolderCogIcon, FolderPenIcon, Trash } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { type ItemType } from '@/components/Menu';
import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { requestAgentRuntime } from '@/features/CreateAgent';
import { openEditingPopover } from '@/features/EditingPopover/store';
import { usePermission } from '@/hooks/usePermission';
import { useAgentStore } from '@/store/agent';
import { useHomeStore } from '@/store/home';

type MenuItem = NonNullable<ItemType> & { sfSymbol?: SFSymbol };

/**
 * Hook for generating menu items for session group containers
 * Used in List/Group/Actions.tsx
 */
export const useSessionGroupMenuItems = () => {
  const { t } = useTranslation(['chat', 'common']);

  const { allowed: canCreate } = usePermission('create_content');
  const { allowed: canEdit } = usePermission('edit_own_content');

  const [storeCreateAgent] = useAgentStore((s) => [s.createAgent]);
  const [removeGroup, refreshAgentList, privateGroups] = useHomeStore((s) => [
    s.removeGroup,
    s.refreshAgentList,
    s.privateAgentGroups,
  ]);

  const [isCreatingAgent, setIsCreatingAgent] = useState(false);

  /**
   * Rename group menu item
   */
  const renameGroupMenuItem = useCallback(
    (groupId: string, groupName: string, anchor: HTMLElement | null): MenuItem => {
      const iconElement = <FolderPenIcon size={14} />;
      return {
        disabled: !canEdit,
        icon: iconElement,
        key: 'rename',
        label: t('sessionGroup.rename'),
        sfSymbol: 'pencil',
        onClick: (info: any) => {
          info.domEvent?.stopPropagation();
          if (!canEdit) return;

          if (anchor) {
            openEditingPopover({ anchor, id: groupId, title: groupName, type: 'group' });
          }
        },
      };
    },
    [canEdit, t],
  );

  /**
   * Config group menu item.
   *
   * Deliberately NOT edit-gated: Category Management is also where a member
   * shows a Category back in their own sidebar, and that show/hide layer is
   * personal. The editing controls inside the modal carry their own
   * `canEdit` gate, so opening it grants nothing.
   */
  const configGroupMenuItem = useCallback(
    (onOpenConfig: () => void): MenuItem => {
      const iconElement = <FolderCogIcon size={14} />;
      return {
        icon: iconElement,
        key: 'config',
        label: t('sessionGroup.config'),
        sfSymbol: 'folder.badge.gearshape',
        onClick: (info: any) => {
          info.domEvent?.stopPropagation();

          onOpenConfig();
        },
      };
    },
    [t],
  );

  /**
   * Delete group menu item with confirmation modal
   */
  const deleteGroupMenuItem = useCallback(
    (groupId: string): MenuItem => {
      const trashIcon = <Trash size={14} />;
      return {
        danger: true,
        disabled: !canEdit,
        icon: trashIcon,
        key: 'delete',
        label: t('delete', { ns: 'common' }),
        sfSymbol: 'trash',
        onClick: (info: any) => {
          info.domEvent?.stopPropagation();
          if (!canEdit) return;

          confirmModal({
            cancelText: t('cancel', { ns: 'common' }),
            content: t('sessionGroup.confirmRemoveGroupAlert'),
            okButtonProps: { danger: true },
            okText: t('delete', { ns: 'common' }),
            onOk: async () => {
              await removeGroup(groupId);
            },
            title: t('delete', { ns: 'common' }),
          });
        },
      };
    },
    [canEdit, t, removeGroup],
  );

  /**
   * Create agent in group menu item
   */
  const createAgentInGroupMenuItem = useCallback(
    (groupId: string, _isPinned?: boolean): MenuItem => {
      const iconElement = <FolderPenIcon size={14} />;
      return {
        disabled: !canCreate,
        icon: iconElement,
        key: 'createAgent',
        label: t('newAgent'),
        sfSymbol: 'plus.bubble',
        onClick: async (info: any) => {
          info.domEvent?.stopPropagation();
          if (!canCreate) return;

          const visibility = privateGroups?.some((group) => group.id === groupId)
            ? 'private'
            : undefined;
          const config = await requestAgentRuntime({ visibility });
          if (!config) return;

          const creatingToast = toast.loading(t('sessionGroup.creatingAgent'));
          setIsCreatingAgent(true);

          try {
            await storeCreateAgent({
              clientRequestId: crypto.randomUUID(),
              config,
              groupId,
              visibility,
            });
            await refreshAgentList();

            creatingToast.close();
            toast.success(t('sessionGroup.createAgentSuccess'));
          } catch (error) {
            creatingToast.close();
            toast.error(t('sessionGroup.createGroupFailed'));
            throw error;
          } finally {
            setIsCreatingAgent(false);
          }
        },
      };
    },
    [canCreate, t, storeCreateAgent, refreshAgentList, privateGroups],
  );

  return {
    configGroupMenuItem,
    createAgentInGroupMenuItem,
    deleteGroupMenuItem,
    isCreatingAgent,
    renameGroupMenuItem,
  };
};
