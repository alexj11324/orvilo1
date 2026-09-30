import { PanelRight, PencilLine, Trash } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { confirmModal } from '@/components/Modal';
import { type SidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
import { usePermission } from '@/hooks/usePermission';
import { useChatStore } from '@/store/chat';

interface ThreadItemDropdownMenuProps {
  id: string;
  sourceMessageId?: string;
  toggleEditing: (visible?: boolean) => void;
}

export const useThreadItemDropdownMenu = ({
  id,
  sourceMessageId,
  toggleEditing,
}: ThreadItemDropdownMenuProps): (() => SidebarMenuItems) => {
  const { t } = useTranslation(['thread', 'common']);
  const { allowed: canEditThread } = usePermission('edit_own_content');

  const [removeThread, openThreadInPortal] = useChatStore((s) => [
    s.removeThread,
    s.openThreadInPortal,
  ]);

  return useCallback(() => {
    return [
      {
        icon: <PanelRight />,
        key: 'openOnRight',
        label: t('openOnRight', { ns: 'common' }),
        onClick: () => {
          openThreadInPortal(id, sourceMessageId);
        },
      },
      {
        type: 'divider' as const,
      },
      {
        disabled: !canEditThread,
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
      {
        danger: true,
        disabled: !canEditThread,
        icon: <Trash />,
        key: 'delete',
        label: t('delete', { ns: 'common' }),
        onClick: () => {
          confirmModal({
            cancelText: t('cancel', { ns: 'common' }),
            content: t('actions.confirmRemoveThread'),
            okButtonProps: { danger: true },
            okText: t('delete', { ns: 'common' }),
            onOk: async () => {
              await removeThread(id);
            },
            title: t('delete', { ns: 'common' }),
          });
        },
        sfSymbol: 'trash',
      },
    ].filter(Boolean) as SidebarMenuItems;
  }, [id, sourceMessageId, canEditThread, removeThread, openThreadInPortal, toggleEditing, t]);
};
