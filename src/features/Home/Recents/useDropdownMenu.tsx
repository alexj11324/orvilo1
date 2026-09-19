import { type MenuProps } from '@lobehub/ui';
import { Icon } from '@lobehub/ui';
import { confirmModal } from '@lobehub/ui/base-ui';
import type { RecentItem } from '@orvilo/types';
import { PencilLineIcon, Trash } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useDocumentTransferMenuItem } from '@/business/client/hooks/useDocumentTransferMenuItem';
import { useTaskTransferMenuItem } from '@/business/client/hooks/useTaskTransferMenuItem';
import { confirmRemoveTopic } from '@/features/DeleteTopicConfirm';
import { usePermission } from '@/hooks/usePermission';
import type { NativeContextMenuItem } from '@/libs/contextMenu/types';
import { useCacheScope } from '@/libs/swr/useCacheScope';
import { documentService } from '@/services/document';
import { taskService } from '@/services/task';
import { topicService } from '@/services/topic';
import { useHomeStore } from '@/store/home';

export const useRecentItemDropdownMenu = (
  item: RecentItem,
  toggleEditing: (visible?: boolean) => void,
) => {
  const { t } = useTranslation(['common', 'topic', 'components']);
  const scope = useCacheScope();
  const [renameRecent, refreshRecents] = useHomeStore((s) => [s.renameRecent, s.refreshRecents]);

  // Viewer can read recents but cannot rename/delete them — keep the menu
  // items visible-but-disabled so the affordance is clear (per disabled-not-
  // hidden UX rule).
  const { allowed: canEdit } = usePermission('edit_own_content');

  // Cross-workspace Transfer to… / Copy to… items. Only document and task recents
  // have a transfer flow today; topic has none. Hooks are called unconditionally and
  // return null unless the matching id is passed (and the workspace feature is on).
  const documentTransferItems = useDocumentTransferMenuItem(
    item.type === 'document' ? item.id : undefined,
  );
  const taskTransferItems = useTaskTransferMenuItem(item.type === 'task' ? item.id : undefined);
  const transferMenuItems = documentTransferItems ?? taskTransferItems;

  const handleRename = useCallback(
    (newTitle: string) => renameRecent({ id: item.id, scope, title: newTitle, type: item.type }),
    [item.id, item.type, renameRecent, scope],
  );

  // Team/project/savedView recents have no rename or delete flow in this menu —
  // those entities are managed on their own surfaces.
  const manageable = item.type === 'document' || item.type === 'task' || item.type === 'topic';

  const handleDelete = useCallback(() => {
    if (item.type === 'topic') {
      void confirmRemoveTopic({
        onConfirm: async (removeFiles) => {
          // Home has no active agent/group, so chatStore.removeTopic early-returns; call the service directly.
          await topicService.removeTopic(item.id, removeFiles);
          await refreshRecents(scope);
        },
        topicIds: [item.id],
      });
      return;
    }

    const confirmMessages: Record<string, string> = {
      document: t('FileManager.actions.confirmDelete', { ns: 'components' }),
    };

    confirmModal({
      cancelText: t('cancel', { ns: 'common' }),
      content: confirmMessages[item.type],
      okButtonProps: { danger: true },
      okText: t('delete', { ns: 'common' }),
      onOk: async () => {
        switch (item.type) {
          case 'document': {
            await documentService.deleteDocument(item.id);
            break;
          }
          case 'task': {
            await taskService.delete(item.id);
            break;
          }
        }
        await refreshRecents(scope);
      },
      title: t('delete', { ns: 'common' }),
    });
  }, [item, refreshRecents, scope, t]);

  const dropdownMenu = useCallback((): MenuProps['items'] => {
    const items: NativeContextMenuItem[] = [
      ...(manageable
        ? ([
            {
              disabled: !canEdit,
              icon: <Icon icon={PencilLineIcon} />,
              key: 'rename',
              label: t('rename'),
              onClick: () => toggleEditing(true),
              sfSymbol: 'pencil',
            },
          ] satisfies NativeContextMenuItem[])
        : []),
      ...(transferMenuItems ?? []),
      ...(transferMenuItems?.length
        ? ([{ type: 'divider' as const }] satisfies NativeContextMenuItem[])
        : []),
      ...(manageable
        ? ([
            {
              danger: true,
              disabled: !canEdit,
              icon: <Icon icon={Trash} />,
              key: 'delete',
              label: t('delete'),
              onClick: handleDelete,
              sfSymbol: 'trash',
            },
          ] satisfies NativeContextMenuItem[])
        : []),
    ];
    return items as MenuProps['items'];
  }, [canEdit, t, toggleEditing, handleDelete, transferMenuItems, manageable]);

  return { dropdownMenu, handleRename };
};
