import { CopyIcon, GitBranchIcon, LinkIcon, MoreHorizontal, Trash } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useTaskTransferMenuItem } from '@/business/client/hooks/useTaskTransferMenuItem';
import ActionIcon from '@/components/ActionIcon';
import { confirmModal } from '@/components/Modal';
import SidebarDropdownMenu, {
  type SidebarDropdownMenuProps,
} from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { useTaskStore } from '@/store/task';

import { useTaskCopyActions } from './useTaskCopyActions';

const TaskDetailHeaderActions = memo(() => {
  const { t } = useTranslation(['chat', 'common']);

  const navigate = useWorkspaceAwareNavigate();
  const { allowed: canEditTask } = usePermission('create_content');
  const { copyBranch, copyId, copyLink, hasBranch, taskId } = useTaskCopyActions();
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const transferItems = useTaskTransferMenuItem(taskId) as SidebarDropdownMenuProps['items'] | null;

  const triggerDelete = useCallback(() => {
    if (!canEditTask) return;
    if (!taskId) return;
    confirmModal({
      content: t('taskDetail.deleteConfirm.content'),
      okButtonProps: { danger: true },
      okText: t('taskDetail.deleteConfirm.ok'),
      onOk: async () => {
        await deleteTask(taskId);
        navigate('/tasks');
      },
      title: t('taskDetail.deleteConfirm.title'),
    });
  }, [canEditTask, taskId, t, deleteTask, navigate]);

  const menuItems = useMemo<SidebarDropdownMenuProps['items']>(() => {
    if (!taskId) return [];

    // The clipboard group mirrors the rail's round buttons; "copy git branch"
    // joins only for real workspace-bound tasks (see `useTaskCopyActions`).
    const copyItems: SidebarDropdownMenuProps['items'] = [
      {
        icon: <CopyIcon />,
        key: 'copyId',
        label: t('taskList.contextMenu.copyId'),
        onClick: copyId,
      },
      {
        icon: <LinkIcon />,
        key: 'copyLink',
        label: t('taskList.contextMenu.copyLink'),
        onClick: copyLink,
      },
      ...(hasBranch
        ? [
            {
              icon: <GitBranchIcon />,
              key: 'copyBranch',
              label: t('taskDetail.copyBranch'),
              onClick: copyBranch,
            },
          ]
        : []),
    ];
    const deleteItem = {
      danger: true,
      disabled: !canEditTask,
      icon: <Trash />,
      key: 'delete',
      label: t('delete', { ns: 'common' }),
      onClick: triggerDelete,
    };

    const resolvedTransferItems =
      typeof transferItems === 'function' ? transferItems() : transferItems;

    if (!resolvedTransferItems?.length) return [...copyItems, { type: 'divider' }, deleteItem];

    return [
      ...copyItems,
      { type: 'divider' },
      ...resolvedTransferItems,
      { type: 'divider' },
      deleteItem,
    ];
  }, [
    taskId,
    copyId,
    copyLink,
    copyBranch,
    hasBranch,
    t,
    triggerDelete,
    canEditTask,
    transferItems,
  ]);

  if (!taskId) return null;

  return (
    <SidebarDropdownMenu items={menuItems}>
      <ActionIcon icon={MoreHorizontal} size={'small'} />
    </SidebarDropdownMenu>
  );
});

export default TaskDetailHeaderActions;
