import type { TaskLabelSummary, TaskStatus, TaskWorkflowCategory } from '@orvilo/types';
import {
  BarChart3Icon,
  BellIcon,
  CalendarIcon,
  CopyIcon,
  FileTextIcon,
  LinkIcon,
  MessageSquareTextIcon,
  PencilIcon,
  StarIcon,
  TagsIcon,
  Trash2Icon,
  TypeIcon,
  UserRoundIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { useTaskTransferMenuItem } from '@/business/client/hooks/useTaskTransferMenuItem';
import type { WorkspaceMemberWithProfile } from '@/business/client/hooks/useWorkspaceMembers';
import { STATUS_PROPERTY_ICON, WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import { confirmModal } from '@/components/Modal';
import { getPriorityIconColor, PRIORITY_LEVELS } from '@/components/PriorityIcon';
import { openRenameModal } from '@/components/RenameModal';
import { toast } from '@/components/toast';
import { useWorkFavoriteToggle } from '@/features/HomeSidebar/Body/useWorkFavoriteToggle';
import { resolveLabelColor } from '@/features/Labels/labelColor';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { useAppOrigin } from '@/hooks/useAppOrigin';
import { usePermission } from '@/hooks/usePermission';
import { closeContextMenu } from '@/libs/contextMenu';
import type { NativeContextMenuItem } from '@/libs/contextMenu/types';
import { useClientDataSWR } from '@/libs/swr';
import { taskLabelKeys } from '@/libs/swr/keys';
import { taskLabelService } from '@/services/taskLabel';
import { useCurrentProjectList } from '@/store/project';
import { useTaskStore } from '@/store/task';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/slices/auth/selectors';

import {
  COLUMN_I18N_KEYS,
  taskStatusBoardColumnKey,
  type TaskStatusChoice,
  taskStatusChoices,
} from '../AgentTaskList/kanbanBoardModel';
import { hasWorkspaceMemberDirectory } from '../shared/memberAssigneeMode';
import { taskDetailPath } from '../shared/taskDetailPath';
import { useAssigneeMenuItems } from './assigneeMenuItems';
import { renderMenuCheck, renderMenuExtra } from './menuExtra';
import { PRIORITY_META } from './TaskPriorityTag';
import { openTaskScheduleDialog } from './TaskScheduleDialog';
import { useIssueStatusMove } from './useIssueStatusMove';
import { useTaskStatusChange } from './useTaskStatusChange';

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.append(textArea);
    textArea.focus();
    textArea.select();
    document.execCommand('copy');
    textArea.remove();
  }
};

type MenuInfo = {
  domEvent: { stopPropagation: () => void };
};

type ActiveSubmenu = 'status' | 'priority' | null;
type TaskItemRouteScope = 'agent' | 'global';

interface TaskItemContextMenu {
  items: NativeContextMenuItem[];
  /**
   * Install the digit-accelerator handlers once the menu opens. Passes the
   * close function of whichever surface opened (native popup or web menu) —
   * the shared imperative `closeContextMenu` is the default so the legacy
   * imperative menu keeps working unchanged.
   */
  onContextMenu: (closeMenu?: () => void) => void;
}

export interface TaskContextMenuTarget {
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  /** Creator owns a private task's only assignable member — mirrors the row picker. */
  createdByUserId?: string | null;
  /** Live run's topic — present while a run is in flight; gates "Open run". */
  currentTopicId?: string | null;
  /** Issue deadline (`YYYY-MM-DD`) — preselects the due-date picker. */
  dueDate?: string | null;
  /** uuid — the favorite and subscription APIs key on id, not identifier. */
  id?: string;
  identifier: string;
  /** Labels already on the task — renders the check marks in the Labels submenu. */
  labels?: readonly TaskLabelSummary[];
  /** Only feeds the copied link's readable slug tail. */
  name?: string | null;
  priority?: number | null;
  /** Owning project — `null`/missing renders "No project" checked. */
  projectId?: string | null;
  status: string;
  /** `private` narrows the Assignee submenu to the task creator. */
  visibility?: 'private' | 'public' | null;
  /** Workflow linkage — every board column is pickable once a state exists. */
  workflowCategory?: TaskWorkflowCategory | null;
  workflowStateId?: string | null;
}

export interface TaskContextMenuActions {
  buildItems: (task: TaskContextMenuTarget) => NativeContextMenuItem[];
  installKeyboardHandlers: (task: TaskContextMenuTarget, closeMenu?: () => void) => void;
  /**
   * Submenu titles appended outside `buildItems` (the Assignee entry) must
   * clear the tracked digit-accelerator hover — wire this to their
   * `onTitleMouseEnter`.
   */
  resetActiveSubmenu: () => void;
}

export const useTaskContextMenuActions = (
  routeScope: TaskItemRouteScope = 'agent',
  onStatusChange?: (choice: TaskStatusChoice) => void | Promise<void>,
): TaskContextMenuActions => {
  const { t } = useTranslation(['chat', 'common']);

  const appOrigin = useAppOrigin();
  const activeWorkspaceSlug = useActiveWorkspaceSlug();
  const { allowed: canEditTask } = usePermission('create_content');

  const changeTaskStatus = useTaskStatusChange();
  const moveWorkflow = useIssueStatusMove();
  const updateTask = useTaskStore((s) => s.updateTask);
  const refreshTaskList = useTaskStore((s) => s.refreshTaskList);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const toggleTaskLabel = useTaskStore((s) => s.toggleTaskLabel);
  const openTopicDrawer = useTaskStore((s) => s.openTopicDrawer);
  const projects = useCurrentProjectList();
  const isLogin = useUserStore(authSelectors.isLogin);
  const activeWorkspaceId = useActiveWorkspaceId();
  const { data: labelRegistryData } = useClientDataSWR(
    isLogin ? taskLabelKeys.list(isLogin, activeWorkspaceId) : null,
    () => taskLabelService.getLabels(),
  );

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
      const currentColumnKey = taskStatusBoardColumnKey({
        status: currentStatus,
        workflowCategory: task.workflowCategory,
        workflowStateId: task.workflowStateId,
      });

      const applyStatusChoice = (choice: TaskStatusChoice) => {
        if (onStatusChange) {
          void onStatusChange(choice);
          return;
        }
        // The shared Issue status command — same CAS move the boards and the
        // detail/list tags commit, with the picker fallback inside it.
        if (choice.state || choice.workflowCategory) {
          void moveWorkflow({
            taskIdentifier: task.identifier,
            target: {
              category: choice.state?.category ?? choice.workflowCategory!,
              workflowStateRefId: choice.state?.id,
            },
          });
        } else if (choice.status) {
          void changeTaskStatus(task.identifier, choice.status);
        }
      };

      let pickIndex = 0;
      const statusChildren = taskStatusChoices(task).map((choice) => {
        // The Kanban board's columns are the options, order and glyphs, triage
        // included; a column the board could not take (workflow-only columns
        // for an unlinked task) renders disabled, like a blocked drop.
        const pickable = Boolean(choice.status || choice.workflowCategory);
        const isCurrent = choice.column.key === currentColumnKey;
        const visual = WORKFLOW_CATEGORY_VISUALS[choice.column.targetWorkflowCategory ?? 'backlog'];
        const VisualIcon = visual.icon;
        if (pickable) pickIndex += 1;
        return {
          extra: pickable ? renderMenuExtra(String(pickIndex), isCurrent) : undefined,
          icon: <VisualIcon color={visual.color} size="1em" />,
          key: `status-${choice.column.key}`,
          label: t(COLUMN_I18N_KEYS[choice.column.key] as never),
          disabled: !canEditTask || !pickable,
          onClick: ({ domEvent }: MenuInfo) => {
            domEvent.stopPropagation();
            if (!canEditTask || !pickable) return;
            if (isCurrent) return;
            applyStatusChoice(choice);
          },
        } as NativeContextMenuItem;
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
        } as NativeContextMenuItem;
      });

      const taskUrl = `${appOrigin}${buildWorkspaceAwarePath(
        taskDetailPath(
          task.identifier,
          routeScope === 'agent' ? (task.assigneeAgentId ?? undefined) : undefined,
          task.name,
        ),
        activeWorkspaceSlug,
      )}`;
      const canOpenRun = currentStatus === 'running' && !!task.currentTopicId;

      // Linear's Labels submenu toggles rows in place — the menu stays open
      // (`closeOnClick: false`) so several labels can flip in one go.
      const assignedLabelIds = new Set((task.labels ?? []).map((label) => label.id));
      const registry = labelRegistryData ?? [];
      const labelChildren = registry.length
        ? registry.map(
            (label) =>
              ({
                closeOnClick: false,
                disabled: !canEditTask,
                extra: renderMenuCheck(assignedLabelIds.has(label.id)),
                icon: (
                  <span
                    style={{
                      backgroundColor: resolveLabelColor(label.name, label.color),
                      borderRadius: '50%',
                      display: 'inline-block',
                      height: 8,
                      width: 8,
                    }}
                  />
                ),
                key: `label-${label.id}`,
                label: label.name,
                onClick: ({ domEvent }: MenuInfo) => {
                  domEvent.stopPropagation();
                  if (!canEditTask) return;
                  void toggleTaskLabel(task.identifier, label.id, !assignedLabelIds.has(label.id), {
                    color: label.color,
                    id: label.id,
                    name: label.name,
                  });
                },
              }) satisfies NativeContextMenuItem,
          )
        : ([
            {
              disabled: true,
              key: 'labels-empty',
              label: t('taskList.contextMenu.labelsEmpty', { defaultValue: 'No labels' }),
            },
          ] satisfies NativeContextMenuItem[]);

      const projectChildren = [
        {
          disabled: !canEditTask,
          extra: renderMenuCheck(!task.projectId),
          key: 'project-none',
          label: t('taskList.contextMenu.noProject', { defaultValue: 'No project' }),
          onClick: ({ domEvent }: MenuInfo) => {
            domEvent.stopPropagation();
            if (!canEditTask || !task.projectId) return;
            void updateTask(task.identifier, { projectId: null });
          },
        },
        ...projects.map(
          (project) =>
            ({
              disabled: !canEditTask,
              extra: renderMenuCheck(task.projectId === project.id),
              key: `project-${project.id}`,
              label: project.name,
              onClick: ({ domEvent }: MenuInfo) => {
                domEvent.stopPropagation();
                if (!canEditTask || task.projectId === project.id) return;
                void updateTask(task.identifier, { projectId: project.id });
              },
            }) satisfies NativeContextMenuItem,
        ),
      ] satisfies NativeContextMenuItem[];

      return [
        ...(canOpenRun
          ? ([
              {
                icon: <MessageSquareTextIcon size="1em" />,
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
        {
          children: statusChildren,
          disabled: !canEditTask,
          icon: <STATUS_PROPERTY_ICON size="1em" />,
          key: 'status',
          label: t('taskList.contextMenu.status'),
          onTitleMouseEnter: () => {
            activeSubmenuRef.current = 'status';
          },
        },
        {
          children: priorityChildren,
          disabled: !canEditTask,
          icon: <BarChart3Icon size="1em" />,
          key: 'priority',
          label: t('taskList.contextMenu.priority'),
          onTitleMouseEnter: () => {
            activeSubmenuRef.current = 'priority';
          },
        },
        ...(task.labels !== undefined
          ? [
              {
                children: labelChildren,
                disabled: !canEditTask,
                icon: <TagsIcon size="1em" />,
                key: 'labels',
                label: t('taskList.contextMenu.labels', { defaultValue: 'Labels' }),
                onTitleMouseEnter: () => {
                  activeSubmenuRef.current = null;
                },
              } satisfies NativeContextMenuItem,
            ]
          : []),
        ...(task.projectId !== undefined
          ? [
              {
                children: projectChildren,
                disabled: !canEditTask,
                icon: <PROJECT_ENTITY_ICON size="1em" />,
                key: 'project',
                label: t('taskList.contextMenu.project', { defaultValue: 'Project' }),
                onTitleMouseEnter: () => {
                  activeSubmenuRef.current = null;
                },
              } satisfies NativeContextMenuItem,
            ]
          : []),
        { type: 'divider' },
        // Linear nests the clipboard actions under one `Copy` submenu.
        {
          children: [
            {
              icon: <CopyIcon size="1em" />,
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
              icon: <LinkIcon size="1em" />,
              key: 'copyLink',
              label: t('taskList.contextMenu.copyLink'),
              onClick: async ({ domEvent }: MenuInfo) => {
                domEvent.stopPropagation();
                await copyToClipboard(taskUrl);
                toast.success(t('taskList.contextMenu.copyLinkSuccess'));
              },
              sfSymbol: 'doc.on.doc',
            },
            {
              icon: <TypeIcon size="1em" />,
              key: 'copyTitle',
              label: t('taskList.contextMenu.copyIssueTitle', { defaultValue: 'Copy title' }),
              onClick: async ({ domEvent }: MenuInfo) => {
                domEvent.stopPropagation();
                await copyToClipboard(task.name ?? task.identifier);
                toast.success(
                  t('taskList.contextMenu.copyTitleSuccess', { defaultValue: 'Title copied' }),
                );
              },
              sfSymbol: 'doc.on.doc',
            },
            {
              icon: <LinkIcon size="1em" />,
              key: 'copyTitleAsLink',
              label: t('taskList.contextMenu.copyTitleAsLink', {
                defaultValue: 'Copy title as link',
              }),
              onClick: async ({ domEvent }: MenuInfo) => {
                domEvent.stopPropagation();
                await copyToClipboard(`[${task.name ?? task.identifier}](${taskUrl})`);
                toast.success(t('taskList.contextMenu.copyLinkSuccess'));
              },
              sfSymbol: 'doc.on.doc',
            },
            {
              icon: <FileTextIcon size="1em" />,
              key: 'copyMarkdown',
              label: t('taskList.contextMenu.copyMarkdown', {
                defaultValue: 'Copy as Markdown',
              }),
              onClick: async ({ domEvent }: MenuInfo) => {
                domEvent.stopPropagation();
                await copyToClipboard(
                  `[${task.identifier}: ${task.name ?? task.identifier}](${taskUrl})`,
                );
                toast.success(
                  t('taskList.contextMenu.copyMarkdownSuccess', {
                    defaultValue: 'Markdown copied',
                  }),
                );
              },
              sfSymbol: 'doc.on.doc',
            },
          ] satisfies NativeContextMenuItem[],
          icon: <CopyIcon size="1em" />,
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
          icon: <Trash2Icon size="1em" />,
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

    const installKeyboardHandlers = (task: TaskContextMenuTarget, closeMenu?: () => void) => {
      if (!canEditTask) return;
      cleanupRef.current?.();
      activeSubmenuRef.current = null;
      const close = closeMenu ?? closeContextMenu;

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
          close();
          cleanup();
          return;
        }

        if (openSubmenu === 'status') {
          const currentColumnKey = taskStatusBoardColumnKey({
            status: task.status as TaskStatus,
            workflowCategory: task.workflowCategory,
            workflowStateId: task.workflowStateId,
          });
          const pickable = taskStatusChoices(task).filter(
            (choice) => choice.status || choice.workflowCategory,
          );
          if (idx < 0 || idx >= pickable.length) return;
          event.preventDefault();
          event.stopPropagation();
          const choice = pickable[idx];
          if (choice.column.key !== currentColumnKey) {
            if (onStatusChange) void onStatusChange(choice);
            else if (choice.state || choice.workflowCategory) {
              void moveWorkflow({
                taskIdentifier: task.identifier,
                target: {
                  category: choice.state?.category ?? choice.workflowCategory!,
                  workflowStateRefId: choice.state?.id,
                },
              });
            } else if (choice.status) {
              void changeTaskStatus(task.identifier, choice.status);
            }
          }
          close();
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
    moveWorkflow,
    updateTask,
    refreshTaskList,
    deleteTask,
    toggleTaskLabel,
    openTopicDrawer,
    projects,
    labelRegistryData,
    onStatusChange,
    routeScope,
  ]);
};

export const useTaskItemContextMenu = (
  task: TaskContextMenuTarget,
  routeScope?: TaskItemRouteScope,
  onStatusChange?: (choice: TaskStatusChoice) => void | Promise<void>,
): TaskItemContextMenu => {
  const { buildItems, installKeyboardHandlers, resetActiveSubmenu } = useTaskContextMenuActions(
    routeScope,
    onStatusChange,
  );
  const transferItems = useTaskTransferMenuItem(task.identifier) as NativeContextMenuItem[] | null;
  const { t } = useTranslation('chat');
  const { allowed: canEditTask } = usePermission('create_content');
  const updateTask = useTaskStore((s) => s.updateTask);
  const refreshTaskList = useTaskStore((s) => s.refreshTaskList);
  const activeWorkspaceId = useActiveWorkspaceId();
  const { pinned: isFavorite, toggle: toggleFavorite } = useWorkFavoriteToggle('task', task.id);

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
    // Linear's top block reads Status → Assignee → Due date → Priority —
    // both inserted items land between Status and Priority in one splice.
    const priorityIndex = base.findIndex(
      (item) =>
        item !== null && typeof item === 'object' && 'key' in item && item.key === 'priority',
    );
    const insertIndex = priorityIndex === -1 ? 1 : priorityIndex;
    const insertedItems: NativeContextMenuItem[] = [];
    if (showAssignee) {
      insertedItems.push({
        children: assigneeItems,
        disabled: !canEditTask,
        icon: <UserRoundIcon size="1em" />,
        key: 'assignee',
        label: t('taskList.contextMenu.assignee'),
        onTitleMouseEnter: resetActiveSubmenu,
      });
    }
    if (task.dueDate !== undefined) {
      insertedItems.push({
        disabled: !canEditTask,
        icon: <CalendarIcon size="1em" />,
        key: 'dueDate',
        label: t('taskList.contextMenu.dueDate', { defaultValue: 'Due date…' }),
        onClick: ({ domEvent }: MenuInfo) => {
          domEvent.stopPropagation();
          openTaskScheduleDialog({ dueDate: task.dueDate ?? null, identifier: task.identifier });
        },
      });
    }
    const withInserted = (() => {
      if (insertedItems.length === 0) return base;
      const next = [...base];
      next.splice(insertIndex, 0, ...insertedItems);
      return next;
    })();
    // Insert transfer/copy entries and the favorite + rename lifecycle
    // actions above the final divider + delete pair — next to the other
    // lifecycle actions but distinct from in-place state changes.
    const deleteAnchor = withInserted.findIndex(
      (item) =>
        item !== null &&
        typeof item === 'object' &&
        'key' in item &&
        (item as { key?: string }).key === 'delete',
    );

    const tailItems = [
      ...(transferItems ?? []),
      ...(transferItems?.length ? ([{ type: 'divider' }] as NativeContextMenuItem[]) : []),
      ...(task.id
        ? [
            {
              icon: <StarIcon fill={isFavorite ? 'currentColor' : 'none'} size="1em" />,
              key: 'favorite',
              label: isFavorite
                ? t('taskList.contextMenu.unfavorite', { defaultValue: 'Unfavorite' })
                : t('taskList.contextMenu.favorite', { defaultValue: 'Favorite' }),
              onClick: ({ domEvent }: MenuInfo) => {
                domEvent.stopPropagation();
                void toggleFavorite();
              },
            } satisfies NativeContextMenuItem,
          ]
        : []),
      {
        // Read-ACL command — a reminder touches only the caller's own row,
        // so it stays enabled for viewers (unlike the write-gated actions).
        icon: <BellIcon size="1em" />,
        key: 'remindMe',
        label: t('taskList.contextMenu.remindMe', { defaultValue: 'Remind me…' }),
        onClick: ({ domEvent }: MenuInfo) => {
          domEvent.stopPropagation();
          openTaskScheduleDialog({ dueDate: task.dueDate ?? null, identifier: task.identifier });
        },
      } satisfies NativeContextMenuItem,
      {
        disabled: !canEditTask,
        icon: <PencilIcon size="1em" />,
        key: 'rename',
        label: t('rename', { ns: 'common' }),
        onClick: ({ domEvent }: MenuInfo) => {
          domEvent.stopPropagation();
          if (!canEditTask) return;
          openRenameModal({
            defaultValue: task.name ?? task.identifier,
            onSave: async (name) => {
              await updateTask(task.identifier, { name });
              await refreshTaskList();
            },
            title: t('rename', { ns: 'common' }),
          });
        },
      } satisfies NativeContextMenuItem,
      { type: 'divider' } as NativeContextMenuItem,
    ];

    if (deleteAnchor === -1) return [...withInserted, ...tailItems];

    const insertAt =
      deleteAnchor > 0 &&
      withInserted[deleteAnchor - 1] !== null &&
      typeof withInserted[deleteAnchor - 1] === 'object' &&
      'type' in (withInserted[deleteAnchor - 1] as object) &&
      (withInserted[deleteAnchor - 1] as { type?: string }).type === 'divider'
        ? deleteAnchor - 1
        : deleteAnchor;

    return [...withInserted.slice(0, insertAt), ...tailItems, ...withInserted.slice(deleteAnchor)];
  }, [
    assigneeItems,
    buildItems,
    canEditTask,
    isFavorite,
    refreshTaskList,
    resetActiveSubmenu,
    showAssignee,
    t,
    task,
    toggleFavorite,
    transferItems,
    updateTask,
  ]);
  const onContextMenu = useCallback(
    (closeMenu?: () => void) => installKeyboardHandlers(task, closeMenu),
    [installKeyboardHandlers, task],
  );
  return { items, onContextMenu };
};
