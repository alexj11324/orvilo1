import { type ContextMenuItem, copyToClipboard, Icon, type MenuInfo } from '@lobehub/ui';
import { confirmModal, toast } from '@lobehub/ui/base-ui';
import type { TaskStatus } from '@orvilo/types';
import {
  BarChart3Icon,
  CircleDashedIcon,
  CopyIcon,
  LinkIcon,
  MessageSquareTextIcon,
  PlayIcon,
  Trash2Icon,
  UserRoundIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { useTaskTransferMenuItem } from '@/business/client/hooks/useTaskTransferMenuItem';
import type { WorkspaceMemberWithProfile } from '@/business/client/hooks/useWorkspaceMembers';
import { getPriorityIconColor, PRIORITY_LEVELS } from '@/components/PriorityIcon';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { useAppOrigin } from '@/hooks/useAppOrigin';
import { usePermission } from '@/hooks/usePermission';
import { closeContextMenu } from '@/libs/contextMenu';
import type { NativeContextMenuItem } from '@/libs/contextMenu/types';
import { useAgentStore } from '@/store/agent';
import { builtinAgentSelectors } from '@/store/agent/selectors';
import { useTaskStore } from '@/store/task';

import { hasWorkspaceMemberDirectory } from '../shared/memberAssigneeMode';
import { taskDetailPath } from '../shared/taskDetailPath';
import { useAssigneeMenuItems } from './assigneeMenuItems';
import { renderMenuExtra } from './menuExtra';
import { PRIORITY_META } from './TaskPriorityTag';
import { STATUS_META, USER_SELECTABLE_STATUSES } from './taskStatusMeta';
import { useTaskStatusChange } from './useTaskStatusChange';

type ActiveSubmenu = 'status' | 'priority' | null;
type TaskItemRouteScope = 'agent' | 'global';

interface TaskItemContextMenu {
  items: NativeContextMenuItem[];
  onContextMenu: () => void;
}

export interface TaskContextMenuTarget {
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  /** Creator owns a private task's only assignable member — mirrors the row picker. */
  createdByUserId?: string | null;
  /** Live run's topic — present while a run is in flight; gates "Open run". */
  currentTopicId?: string | null;
  identifier: string;
  /** Only feeds the copied link's readable slug tail. */
  name?: string | null;
  priority?: number | null;
  status: string;
  /** `private` narrows the Assignee submenu to the task creator. */
  visibility?: 'private' | 'public' | null;
}

const RUN_NOW_STATUSES = new Set<TaskStatus>(['backlog', 'completed']);

export interface TaskContextMenuActions {
  buildItems: (task: TaskContextMenuTarget) => NativeContextMenuItem[];
  installKeyboardHandlers: (task: TaskContextMenuTarget) => void;
  /**
   * Submenu titles appended outside `buildItems` (the Assignee entry) must
   * clear the tracked digit-accelerator hover — wire this to their
   * `onTitleMouseEnter`.
   */
  resetActiveSubmenu: () => void;
}

export const useTaskContextMenuActions = (
  routeScope: TaskItemRouteScope = 'agent',
  onStatusChange?: (status: TaskStatus) => void | Promise<void>,
): TaskContextMenuActions => {
  const { t } = useTranslation(['chat', 'common']);

  const appOrigin = useAppOrigin();
  const activeWorkspaceSlug = useActiveWorkspaceSlug();
  const { allowed: canEditTask } = usePermission('create_content');

  const changeTaskStatus = useTaskStatusChange();
  const updateTask = useTaskStore((s) => s.updateTask);
  const refreshTaskList = useTaskStore((s) => s.refreshTaskList);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const runTask = useTaskStore((s) => s.runTask);
  const openTopicDrawer = useTaskStore((s) => s.openTopicDrawer);
  const inboxAgentId = useAgentStore(builtinAgentSelectors.inboxAgentId);

  const cleanupRef = useRef<(() => void) | null>(null);
  const activeSubmenuRef = useRef<ActiveSubmenu>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  return useMemo<TaskContextMenuActions>(() => {
    const triggerDelete = (identifier: string) => {
      if (!canEditTask) return;
      confirmModal({
        content: t('taskDetail.deleteConfirm.content'),
        okButtonProps: { danger: true },
        okText: t('taskDetail.deleteConfirm.ok'),
        onOk: async () => {
          await deleteTask(identifier);
        },
        title: t('taskDetail.deleteConfirm.title'),
      });
    };

    const buildItems = (task: TaskContextMenuTarget): NativeContextMenuItem[] => {
      const currentStatus = task.status as TaskStatus;
      const currentPriority = task.priority ?? 0;

      const statusChildren = USER_SELECTABLE_STATUSES.map((status, index) => {
        const meta = STATUS_META[status];
        const isCurrent = status === currentStatus;
        return {
          extra: renderMenuExtra(String(index + 1), isCurrent),
          icon: <Icon color={meta.color} icon={meta.icon} />,
          key: `status-${status}`,
          label: t(`taskDetail.status.${status}`, { defaultValue: meta.label }),
          disabled: !canEditTask,
          onClick: ({ domEvent }: MenuInfo) => {
            domEvent.stopPropagation();
            if (!canEditTask) return;
            if (status === currentStatus) return;
            if (onStatusChange) {
              void onStatusChange(status);
              return;
            }
            void changeTaskStatus(task.identifier, status);
          },
        } as ContextMenuItem;
      });

      const priorityChildren = PRIORITY_LEVELS.map((level, index) => {
        const meta = PRIORITY_META[level];
        const PriorityIcon = meta.icon;
        const isCurrent = level === currentPriority;
        return {
          extra: renderMenuExtra(String(index + 1), isCurrent),
          icon: <PriorityIcon color={getPriorityIconColor(level)} size={16} />,
          key: `priority-${level}`,
          label: t(`taskDetail.${meta.labelKey}` as never, { defaultValue: meta.label }),
          disabled: !canEditTask,
          onClick: async ({ domEvent }: MenuInfo) => {
            domEvent.stopPropagation();
            if (!canEditTask) return;
            if (level === currentPriority) return;
            await updateTask(task.identifier, { priority: level });
            await refreshTaskList();
          },
        } as ContextMenuItem;
      });

      const taskUrl = `${appOrigin}${buildWorkspaceAwarePath(
        taskDetailPath(
          task.identifier,
          routeScope === 'agent' ? (task.assigneeAgentId ?? undefined) : undefined,
          task.name,
        ),
        activeWorkspaceSlug,
      )}`;
      const canRunNow = RUN_NOW_STATUSES.has(currentStatus);
      const canOpenRun = currentStatus === 'running' && !!task.currentTopicId;

      return [
        ...(canOpenRun
          ? ([
              {
                icon: <Icon icon={MessageSquareTextIcon} />,
                key: 'openRun',
                label: t('taskList.contextMenu.openRun', { defaultValue: 'Open run' }),
                onClick: ({ domEvent }: MenuInfo) => {
                  domEvent.stopPropagation();
                  openTopicDrawer(task.currentTopicId!, {
                    agentId: task.assigneeAgentId ?? undefined,
                    taskId: task.identifier,
                    title: task.name ?? undefined,
                  });
                },
              },
              { type: 'divider' },
            ] satisfies NativeContextMenuItem[])
          : []),
        ...(canRunNow
          ? ([
              {
                icon: <Icon icon={PlayIcon} />,
                key: 'runNow',
                label: t('taskList.contextMenu.runNow'),
                disabled: !canEditTask,
                onClick: async ({ domEvent }: MenuInfo) => {
                  domEvent.stopPropagation();
                  if (!canEditTask) return;
                  if (!task.assigneeAgentId && !task.assigneeUserId && inboxAgentId) {
                    await updateTask(task.identifier, { assigneeAgentId: inboxAgentId });
                  }
                  await runTask(task.identifier);
                },
                sfSymbol: 'play.fill',
              },
              { type: 'divider' },
            ] satisfies NativeContextMenuItem[])
          : []),
        {
          children: statusChildren,
          disabled: !canEditTask,
          icon: <Icon icon={CircleDashedIcon} />,
          key: 'status',
          label: t('taskList.contextMenu.status'),
          onTitleMouseEnter: () => {
            activeSubmenuRef.current = 'status';
          },
        },
        {
          children: priorityChildren,
          disabled: !canEditTask,
          icon: <Icon icon={BarChart3Icon} />,
          key: 'priority',
          label: t('taskList.contextMenu.priority'),
          onTitleMouseEnter: () => {
            activeSubmenuRef.current = 'priority';
          },
        },
        { type: 'divider' },
        // Linear nests the clipboard actions under one `Copy` submenu.
        {
          children: [
            {
              icon: <Icon icon={CopyIcon} />,
              key: 'copyId',
              label: t('taskList.contextMenu.copyId'),
              onClick: async ({ domEvent }: MenuInfo) => {
                domEvent.stopPropagation();
                await copyToClipboard(task.identifier);
                toast.success(t('taskList.contextMenu.copyIdSuccess'));
              },
              sfSymbol: 'doc.on.doc',
            },
            {
              icon: <Icon icon={LinkIcon} />,
              key: 'copyLink',
              label: t('taskList.contextMenu.copyLink'),
              onClick: async ({ domEvent }: MenuInfo) => {
                domEvent.stopPropagation();
                await copyToClipboard(taskUrl);
                toast.success(t('taskList.contextMenu.copyLinkSuccess'));
              },
              sfSymbol: 'doc.on.doc',
            },
          ] satisfies ContextMenuItem[],
          icon: <Icon icon={CopyIcon} />,
          key: 'copy',
          label: t('taskList.contextMenu.copy', { defaultValue: 'Copy' }),
          onTitleMouseEnter: () => {
            // Not a digit-accelerated submenu — clear the tracked hover so a
            // stray number key can't fire the status/priority pick behind it.
            activeSubmenuRef.current = null;
          },
        },
        { type: 'divider' },
        {
          danger: true,
          disabled: !canEditTask,
          icon: <Icon icon={Trash2Icon} />,
          key: 'delete',
          label: t('delete', { ns: 'common' }),
          onClick: ({ domEvent }: MenuInfo) => {
            domEvent.stopPropagation();
            if (!canEditTask) return;
            triggerDelete(task.identifier);
          },
          sfSymbol: 'trash',
        },
      ];
    };

    const installKeyboardHandlers = (task: TaskContextMenuTarget) => {
      if (!canEditTask) return;
      cleanupRef.current?.();
      activeSubmenuRef.current = null;

      const currentStatus = task.status as TaskStatus;
      const currentPriority = task.priority ?? 0;

      const cleanup = () => {
        document.removeEventListener('keydown', keyHandler, true);
        window.removeEventListener('pointerdown', pointerHandler, true);
        window.removeEventListener('contextmenu', contextHandler, true);
        cleanupRef.current = null;
        activeSubmenuRef.current = null;
      };

      const keyHandler = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          cleanup();
          return;
        }

        const num = Number.parseInt(event.key, 10);
        if (Number.isNaN(num)) return;
        const idx = num - 1;

        const openSubmenu = activeSubmenuRef.current;
        if (!openSubmenu) return;

        if (openSubmenu === 'priority') {
          if (idx < 0 || idx >= PRIORITY_LEVELS.length) return;
          event.preventDefault();
          event.stopPropagation();
          const nextLevel = PRIORITY_LEVELS[idx];
          if (nextLevel !== currentPriority) {
            void (async () => {
              await updateTask(task.identifier, { priority: nextLevel });
              await refreshTaskList();
            })();
          }
          closeContextMenu();
          cleanup();
          return;
        }

        if (openSubmenu === 'status') {
          if (idx < 0 || idx >= USER_SELECTABLE_STATUSES.length) return;
          event.preventDefault();
          event.stopPropagation();
          const nextStatus = USER_SELECTABLE_STATUSES[idx];
          if (nextStatus !== currentStatus) {
            if (onStatusChange) void onStatusChange(nextStatus);
            else void changeTaskStatus(task.identifier, nextStatus);
          }
          closeContextMenu();
          cleanup();
        }
      };

      const pointerHandler = () => {
        cleanup();
      };

      const contextHandler = () => {
        cleanup();
      };

      document.addEventListener('keydown', keyHandler, true);
      window.addEventListener('pointerdown', pointerHandler, true);
      window.addEventListener('contextmenu', contextHandler, true);

      cleanupRef.current = cleanup;
    };

    const resetActiveSubmenu = () => {
      activeSubmenuRef.current = null;
    };

    return { buildItems, installKeyboardHandlers, resetActiveSubmenu };
  }, [
    canEditTask,
    t,
    appOrigin,
    activeWorkspaceSlug,
    changeTaskStatus,
    updateTask,
    refreshTaskList,
    deleteTask,
    runTask,
    openTopicDrawer,
    inboxAgentId,
    onStatusChange,
    routeScope,
  ]);
};

export const useTaskItemContextMenu = (
  task: TaskContextMenuTarget,
  routeScope?: TaskItemRouteScope,
  onStatusChange?: (status: TaskStatus) => void | Promise<void>,
): TaskItemContextMenu => {
  const { buildItems, installKeyboardHandlers, resetActiveSubmenu } = useTaskContextMenuActions(
    routeScope,
    onStatusChange,
  );
  const transferItems = useTaskTransferMenuItem(task.identifier) as ContextMenuItem[] | null;
  const { t } = useTranslation('chat');
  const { allowed: canEditTask } = usePermission('create_content');
  const updateTask = useTaskStore((s) => s.updateTask);
  const activeWorkspaceId = useActiveWorkspaceId();

  const handleAssigneeSelect = useCallback(
    (userId: string | null, member?: WorkspaceMemberWithProfile) => {
      if (!canEditTask || userId === (task.assigneeUserId ?? null)) return;
      void updateTask(
        task.identifier,
        { assigneeUserId: userId },
        {
          optimisticAssignee: member
            ? {
                avatar: member.user?.avatar ?? null,
                id: member.userId,
                name: member.user?.fullName ?? null,
                type: 'user',
              }
            : undefined,
        },
      );
    },
    [canEditTask, task.assigneeUserId, task.identifier, updateTask],
  );

  const assigneeItems = useAssigneeMenuItems(task.assigneeUserId, handleAssigneeSelect, {
    creatorId: task.createdByUserId,
    disabled: !canEditTask,
    visibility: task.visibility,
  });
  // The member directory is absent in personal mode — the Assignee submenu
  // still earns its slot once a user assignee exists so it can be cleared.
  const showAssignee =
    hasWorkspaceMemberDirectory(activeWorkspaceId) || Boolean(task.assigneeUserId);

  const items = useMemo(() => {
    const base = buildItems(task);
    // Linear orders Assignee immediately after Priority.
    const withAssignee = showAssignee
      ? (() => {
          const priorityIndex = base.findIndex(
            (item) =>
              item !== null && typeof item === 'object' && 'key' in item && item.key === 'priority',
          );
          const assigneeItem: ContextMenuItem = {
            children: assigneeItems,
            disabled: !canEditTask,
            icon: <Icon icon={UserRoundIcon} />,
            key: 'assignee',
            label: t('taskList.contextMenu.assignee'),
            onTitleMouseEnter: resetActiveSubmenu,
          };
          const next = [...base];
          next.splice(priorityIndex === -1 ? 2 : priorityIndex + 1, 0, assigneeItem);
          return next;
        })()
      : base;
    if (!transferItems || transferItems.length === 0) return withAssignee;

    // Insert transfer/copy entries above the final divider + delete pair so
    // they sit next to the other lifecycle actions but kept distinct from
    // in-place state changes.
    const deleteAnchor = withAssignee.findIndex(
      (item) =>
        item !== null &&
        typeof item === 'object' &&
        'key' in item &&
        (item as { key?: string }).key === 'delete',
    );
    if (deleteAnchor === -1) return [...withAssignee, ...transferItems];

    const insertAt =
      deleteAnchor > 0 &&
      withAssignee[deleteAnchor - 1] !== null &&
      typeof withAssignee[deleteAnchor - 1] === 'object' &&
      'type' in (withAssignee[deleteAnchor - 1] as object) &&
      (withAssignee[deleteAnchor - 1] as { type?: string }).type === 'divider'
        ? deleteAnchor - 1
        : deleteAnchor;

    return [
      ...withAssignee.slice(0, insertAt),
      ...transferItems,
      { type: 'divider' } as ContextMenuItem,
      ...withAssignee.slice(deleteAnchor),
    ];
  }, [
    assigneeItems,
    buildItems,
    canEditTask,
    resetActiveSubmenu,
    showAssignee,
    t,
    task,
    transferItems,
  ]);
  const onContextMenu = useCallback(
    () => installKeyboardHandlers(task),
    [installKeyboardHandlers, task],
  );
  return { items, onContextMenu };
};
