import {
  CopyIcon,
  FileTextIcon,
  GitBranchIcon,
  LinkIcon,
  MoreHorizontal,
  Trash,
  TypeIcon,
  UnlinkIcon,
} from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useTaskTransferMenuItem } from '@/business/client/hooks/useTaskTransferMenuItem';
import ActionIcon from '@/components/ActionIcon';
import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import SidebarDropdownMenu, {
  type SidebarDropdownMenuProps,
  type SidebarMenuItemData,
  type SidebarMenuItems,
} from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import { relationKindOf } from './relationGroups';
import { useTaskDetailSelector } from './TaskDetailScope';
import { useTaskCopyActions } from './useTaskCopyActions';

// Each entry names the issue on the far side of the edge, not the edge itself.
const REMOVE_RELATION_LABEL = {
  blockedBy: 'taskDetail.menu.removeBlocking',
  blocking: 'taskDetail.menu.removeBlocked',
  relates: 'taskDetail.menu.removeRelated',
} as const;

/**
 * One entry per thing this issue is linked to — its parent, each direct
 * sub-issue, each relation — so a link can be dropped without scrolling to the
 * section that shows it. Everything is read from the already-loaded detail.
 */
const useTaskRemoveMenuItems = (taskId: string | undefined, disabled: boolean) => {
  const { t } = useTranslation('chat');
  const detail = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  const updateTask = useTaskStore((s) => s.updateTask);
  const removeDependency = useTaskStore((s) => s.removeDependency);
  const removeIssueRelation = useTaskStore((s) => s.removeIssueRelation);

  return useMemo<SidebarMenuItemData[]>(() => {
    if (!taskId) return [];

    // `updateTask` shows its own failure toast and refetches both sides of the
    // edge, so the rejection only needs to be kept off the console.
    const unparent = (id: string) => () =>
      void updateTask(id, { parentTaskId: null }).catch(() => {});
    const items: SidebarMenuItemData[] = [];

    if (detail?.parent) {
      items.push({
        disabled,
        extra: detail.parent.identifier,
        key: 'remove-parent',
        label: t('taskDetail.menu.removeParent'),
        onClick: unparent(taskId),
      });
    }

    for (const child of detail?.subtasks ?? []) {
      items.push({
        disabled,
        extra: child.identifier,
        key: `remove-sub-issue-${child.identifier}`,
        label: t('taskDetail.menu.removeSubIssue'),
        onClick: unparent(child.identifier),
      });
    }

    for (const edge of detail?.dependencies ?? []) {
      const kind = relationKindOf(edge);
      if (!kind) continue;

      // Same endpoints the relation rows in `TaskPrerequisites` unlink with.
      const unlink = () => {
        if (edge.relationId) return removeIssueRelation(taskId, edge.relationId);
        if (kind === 'blocking') return removeDependency(edge.dependsOn, taskId, 'blocks');
        return removeDependency(
          taskId,
          edge.id ?? edge.dependsOn,
          kind === 'relates' ? 'relates' : 'blocks',
        );
      };
      items.push({
        disabled,
        extra: edge.dependsOn,
        key: `remove-relation-${edge.relationId ?? `${kind}-${edge.dependsOn}`}`,
        label: t(REMOVE_RELATION_LABEL[kind]),
        onClick: () => void unlink().catch(() => toast.error(t('taskDetail.menu.removeFailed'))),
      });
    }

    return items;
  }, [taskId, disabled, detail, t, updateTask, removeDependency, removeIssueRelation]);
};

const TaskDetailHeaderActions = memo(() => {
  const { t } = useTranslation(['chat', 'common']);

  const navigate = useWorkspaceAwareNavigate();
  const { allowed: canEditTask } = usePermission('create_content');
  const {
    copyBranch,
    copyId,
    copyLink,
    copyMarkdown,
    copyTitle,
    copyTitleAsLink,
    hasBranch,
    taskId,
  } = useTaskCopyActions();
  const removeItems = useTaskRemoveMenuItems(taskId, !canEditTask);
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

  const menuItems = useMemo<SidebarMenuItems>(() => {
    if (!taskId) return [];

    // Clipboard actions fold into one submenu so the top level stays short;
    // "copy git branch" joins only for real workspace-bound tasks (see
    // `useTaskCopyActions`).
    const copyItem: SidebarMenuItemData = {
      children: [
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
        {
          icon: <TypeIcon />,
          key: 'copyTitle',
          label: t('taskList.contextMenu.copyIssueTitle'),
          onClick: copyTitle,
        },
        {
          icon: <LinkIcon />,
          key: 'copyTitleAsLink',
          label: t('taskList.contextMenu.copyTitleAsLink'),
          onClick: copyTitleAsLink,
        },
        {
          icon: <FileTextIcon />,
          key: 'copyMarkdown',
          label: t('taskList.contextMenu.copyMarkdown'),
          onClick: copyMarkdown,
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
      ],
      icon: <CopyIcon />,
      key: 'copy',
      label: t('taskList.contextMenu.copy'),
    };
    // Nothing linked → no Remove entry at all, rather than a dead submenu.
    const removeItem: SidebarMenuItemData | null = removeItems.length
      ? {
          children: removeItems,
          icon: <UnlinkIcon />,
          key: 'remove',
          label: t('taskDetail.menu.remove'),
        }
      : null;
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

    return [
      copyItem,
      removeItem,
      { type: 'divider' },
      ...(resolvedTransferItems?.length ? [...resolvedTransferItems, { type: 'divider' }] : []),
      deleteItem,
    ];
  }, [
    taskId,
    copyId,
    copyLink,
    copyTitle,
    copyTitleAsLink,
    copyMarkdown,
    copyBranch,
    hasBranch,
    removeItems,
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
