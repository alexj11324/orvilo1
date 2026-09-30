import { LucideCopy, Pen, PictureInPicture2Icon, Pin, PinOff, Trash } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useAgentGroupTransferMenuItem } from '@/business/client/hooks/useAgentGroupTransferMenuItem';
import { useAgentGroupTransferToMemberMenuItem } from '@/business/client/hooks/useAgentGroupTransferToMemberMenuItem';
import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { openEditingPopover } from '@/features/EditingPopover/store';
import { type SidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useResourceAccess } from '@/features/ResourcePermission/useResourceAccess';
import { usePermission } from '@/hooks/usePermission';
import { useResourceManageable } from '@/hooks/useResourceManageable';
import { useGlobalStore } from '@/store/global';
import { useHomeStore } from '@/store/home';
import { getDeleteErrorMessageKey } from '@/utils/forbiddenError';

interface UseGroupDropdownMenuParams {
  anchor: HTMLElement | null;
  avatar?: string;
  backgroundColor?: string;
  description?: string | null;
  id: string;
  memberAvatars?: { avatar?: string; background?: string }[];
  pinned: boolean;
  title: string;
  userId?: string | null;
}

export const useGroupDropdownMenu = ({
  anchor,
  avatar,
  backgroundColor,
  description,
  id,
  memberAvatars,
  pinned,
  title,
  userId,
}: UseGroupDropdownMenuParams): (() => SidebarMenuItems) => {
  const { t } = useTranslation(['chat', 'common']);

  const { allowed: canEdit } = usePermission('edit_own_content');
  const { canEditResource, isAccessResolved } = useResourceAccess('agentGroup', id);
  const canConfigure = canEdit && isAccessResolved && canEditResource;
  const canManage = useResourceManageable(userId);

  const openAgentInNewWindow = useGlobalStore((s) => s.openAgentInNewWindow);
  const [pinAgentGroup, duplicateAgentGroup, removeAgentGroup] = useHomeStore((s) => [
    s.pinAgentGroup,
    s.duplicateAgentGroup,
    s.removeAgentGroup,
  ]);
  const transferMenuItems = useAgentGroupTransferMenuItem(id, {
    avatar,
    backgroundColor,
    description,
    memberAvatars,
    title,
  });
  const transferToMemberItem = useAgentGroupTransferToMemberMenuItem(id, {
    avatar,
    backgroundColor,
    title,
  });

  return useMemo(
    () => () =>
      [
        ...(canConfigure
          ? [
              {
                icon: pinned ? <PinOff size={16} /> : <Pin size={16} />,
                key: 'pin',
                label: t(pinned ? 'pinOff' : 'pin'),
                onClick: () => pinAgentGroup(id, !pinned),
                sfSymbol: pinned ? 'pin.slash' : 'pin',
              },
              {
                icon: <Pen size={16} />,
                key: 'rename',
                label: t('rename', { ns: 'common' }),
                onClick: (info: any) => {
                  info.domEvent?.stopPropagation();
                  if (anchor) {
                    openEditingPopover({
                      anchor,
                      avatar,
                      backgroundColor,
                      id,
                      memberAvatars,
                      title,
                      type: 'agentGroup',
                    });
                  }
                },
                sfSymbol: 'pencil',
              },
              {
                icon: <LucideCopy size={16} />,
                key: 'duplicate',
                label: t('duplicate', { ns: 'common' }),
                onClick: ({ domEvent }: any) => {
                  domEvent.stopPropagation();
                  duplicateAgentGroup(id);
                },
                sfSymbol: 'doc.on.doc',
              },
            ]
          : []),
        {
          icon: <PictureInPicture2Icon size={16} />,
          key: 'openInNewWindow',
          label: t('openInNewWindow'),
          onClick: ({ domEvent }: any) => {
            domEvent.stopPropagation();
            openAgentInNewWindow(id);
          },
          sfSymbol: 'macwindow.badge.plus',
        },
        ...(canConfigure && (transferMenuItems?.length || transferToMemberItem)
          ? [
              { type: 'divider' as const },
              ...(transferMenuItems ?? []),
              ...(transferToMemberItem ? [transferToMemberItem] : []),
            ]
          : []),
        ...(canConfigure && canManage
          ? [
              { type: 'divider' as const },
              {
                danger: true,
                icon: <Trash size={16} />,
                key: 'delete',
                label: t('delete', { ns: 'common' }),
                onClick: ({ domEvent }: any) => {
                  domEvent.stopPropagation();
                  confirmModal({
                    cancelText: t('cancel', { ns: 'common' }),
                    content: t('confirmRemoveChatGroupItemAlert'),
                    okButtonProps: { danger: true },
                    okText: t('delete', { ns: 'common' }),
                    onOk: async () => {
                      try {
                        await removeAgentGroup(id);
                        toast.success(t('confirmRemoveGroupSuccess'));
                      } catch (error) {
                        toast.error(t(getDeleteErrorMessageKey(error), { ns: 'common' }));
                      }
                    },
                    title: t('delete', { ns: 'common' }),
                  });
                },
                sfSymbol: 'trash',
              },
            ]
          : []),
      ] as SidebarMenuItems,
    [
      anchor,
      avatar,
      backgroundColor,
      canConfigure,
      canManage,
      memberAvatars,
      t,
      pinned,
      pinAgentGroup,
      id,
      title,
      duplicateAgentGroup,
      openAgentInNewWindow,
      removeAgentGroup,
      transferMenuItems,
      transferToMemberItem,
    ],
  );
};
