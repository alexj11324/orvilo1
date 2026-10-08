import {
  CopyIcon,
  CopyPlusIcon,
  FileTextIcon,
  GitBranchIcon,
  LinkIcon,
  MoreHorizontal,
  PanelTopIcon,
  Trash,
  TypeIcon,
  UnlinkIcon,
} from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useTaskTransferMenuItem } from '@/business/client/hooks/useTaskTransferMenuItem';
import ActionIcon from '@/components/ActionIcon';
import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { appNavigate } from '@/features/Electron/navigation/appNavigate';
import SidebarDropdownMenu, {
  type SidebarDropdownMenuProps,
  type SidebarMenuItemData,
  type SidebarMenuItems,
} from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import { useIssueStatusMove } from '../features/useIssueStatusMove';
import { taskDetailPath } from '../shared/taskDetailPath';
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

/**
 * "Make a copy": a new issue prefilled from the loaded detail — title with a
 * copy suffix, description, priority, labels, project, team and assignees.
 * Deliberately not carried over: parent, relations, schedule and status, so the
 * copy starts as a fresh, unlinked issue in the default state.
 */
const useDuplicateTask = () => {
  const { t } = useTranslation('chat');
  const navigate = useWorkspaceAwareNavigate();
  const detail = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  const createTask = useTaskStore((s) => s.createTask);
  const toggleTaskLabel = useTaskStore((s) => s.toggleTaskLabel);

  return useCallback(async () => {
    if (!detail) return;
    try {
      const created = await createTask({
        assigneeAgentId: detail.agentId ?? undefined,
        assigneeUserId: detail.userId ?? undefined,
        description: detail.description ?? undefined,
        editorData: detail.editorData ?? undefined,
        instruction: detail.instruction,
        name: t('taskDetail.menu.copyOfTitle', { title: detail.name || detail.identifier }),
        priority: detail.priority || undefined,
        projectId: detail.projectId ?? undefined,
        teamId: detail.teamId ?? undefined,
        visibility: detail.visibility,
      });
      // `null` means another create is already in flight — nothing was made.
      if (!created) return;

      // Preserve the committed copy while reporting incomplete label attachment.
      const labels = await Promise.allSettled(
        (detail.labels ?? []).map((label) =>
          toggleTaskLabel(created.identifier, label.id, true, label),
        ),
      );
      if (labels.some((result) => result.status === 'rejected')) {
        toast.warning(t('taskList.contextMenu.copyLabelsFailed'));
      } else {
        toast.success(t('taskList.contextMenu.copySuccess'));
      }
      navigate(
        taskDetailPath(created.identifier, created.assigneeAgentId ?? undefined, created.name),
      );
    } catch {
      toast.error(t('taskList.contextMenu.copyFailed'));
    }
  }, [detail, createTask, toggleTaskLabel, navigate, t]);
};

const TaskDetailHeaderActions = memo(() => {
  const { t } = useTranslation(['chat', 'common', 'topic']);

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
    taskPath,
  } = useTaskCopyActions();
  const removeItems = useTaskRemoveMenuItems(taskId, !canEditTask);
  const duplicateTask = useDuplicateTask();
  const moveWorkflow = useIssueStatusMove();
  const workflowCategory = useTaskDetailSelector(
    (s, scopedTaskId) => taskDetailSelectors.taskDetail(s, scopedTaskId)?.workflowCategory,
  );
  const isClosed = workflowCategory === 'canceled' || workflowCategory === 'done';
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

    // The host adapter decides what a tab is: an app tab on desktop, a browser
    // tab on web.
    const openInNewTabItem: SidebarMenuItemData = {
      icon: <PanelTopIcon />,
      key: 'openInNewTab',
      label: t('actions.openInNewTab', { ns: 'topic' }),
      onClick: () => appNavigate(taskPath, { target: 'newTab' }),
    };
    const makeCopyItem: SidebarMenuItemData = {
      disabled: !canEditTask,
      icon: <CopyPlusIcon />,
      key: 'makeCopy',
      label: t('taskDetail.menu.makeCopy'),
      onClick: () => void duplicateTask(),
    };
    // The terminal toggle: cancel an open issue, or put a closed one back in
    // Todo. Both go through the shared status command, which reports its own
    // failures — and Todo never auto-starts a run.
    // The glyph is the board's own mark for the state the click lands in.
    const closeTarget = isClosed ? 'todo' : 'canceled';
    const CloseTargetIcon = WORKFLOW_CATEGORY_VISUALS[closeTarget].icon;
    const closeItem: SidebarMenuItemData = {
      disabled: !canEditTask,
      icon: <CloseTargetIcon color={WORKFLOW_CATEGORY_VISUALS[closeTarget].color} />,
      key: isClosed ? 'reopen' : 'cancel',
      label: t(isClosed ? 'taskDetail.menu.reopen' : 'taskDetail.menu.cancel'),
      onClick: () =>
        void moveWorkflow({
          target: { category: closeTarget },
          taskIdentifier: taskId,
        }).catch(() => {}),
    };

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
      openInNewTabItem,
      copyItem,
      { type: 'divider' },
      makeCopyItem,
      removeItem,
      { type: 'divider' },
      ...(resolvedTransferItems?.length ? [...resolvedTransferItems, { type: 'divider' }] : []),
      closeItem,
      { type: 'divider' },
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
    taskPath,
    duplicateTask,
    moveWorkflow,
    isClosed,
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
