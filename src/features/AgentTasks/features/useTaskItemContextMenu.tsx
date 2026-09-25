import { type ContextMenuItem, copyToClipboard, Icon, type MenuInfo } from '@lobehub/ui';
import { confirmModal, toast } from '@lobehub/ui/base-ui';
import type { TaskStatus } from '@orvilo/types';
import {
  BarChart3Icon,
  CircleDashedIcon,
  CopyIcon,
  CopySlashIcon,
  InboxIcon,
  LinkIcon,
  MessageSquareTextIcon,
  PlayIcon,
  Trash2Icon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { useTaskTransferMenuItem } from '@/business/client/hooks/useTaskTransferMenuItem';
import { getPriorityIconColor, PRIORITY_LEVELS } from '@/components/PriorityIcon';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import MarkDuplicateModal from '@/features/WorkTeams/MarkDuplicateModal';
import { buildTriageMutationInput } from '@/features/WorkTeams/triage/teamTriageRowModel';
import { useAppOrigin } from '@/hooks/useAppOrigin';
import { usePermission } from '@/hooks/usePermission';
import { closeContextMenu } from '@/libs/contextMenu';
import type { NativeContextMenuItem } from '@/libs/contextMenu/types';
import { useClientDataSWR } from '@/libs/swr';
import { lambdaClient } from '@/libs/trpc/client';
import { workAttentionService } from '@/services/workAttention';
import { useAgentStore } from '@/store/agent';
import { builtinAgentSelectors } from '@/store/agent/selectors';
import { useTaskStore } from '@/store/task';
import { isTrpcErrorCode } from '@/utils/trpcError';

import { taskDetailPath } from '../shared/taskDetailPath';
import { renderMenuExtra } from './menuExtra';
import { PRIORITY_META } from './TaskPriorityTag';
import { STATUS_META, USER_SELECTABLE_STATUSES } from './taskStatusMeta';
import { useTaskStatusChange } from './useTaskStatusChange';

type ActiveSubmenu = 'status' | 'priority' | null;
type TaskItemRouteScope = 'agent' | 'global';

interface TaskItemContextMenu {
  /** Renders the Duplicate-canonical picker when the task is triage-eligible. */
  duplicateModal?: ReactNode;
  items: NativeContextMenuItem[];
  onContextMenu: () => void;
}

export interface TaskContextMenuTarget {
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  /** Live run's topic — present while a run is in flight; gates "Open run". */
  currentTopicId?: string | null;
  domainRevision?: number;
  id?: string;
  identifier: string;
  /** Only feeds the copied link's readable slug tail. */
  name?: string | null;
  priority?: number | null;
  status: string;
  teamId?: string | null;
}

export interface TaskTriageTarget {
  domainRevision: number;
  id: string;
  teamId: string;
}

export interface TaskTriageMenuExtras {
  onOpenDuplicate: () => void;
  triageTarget: TaskTriageTarget;
}

const RUN_NOW_STATUSES = new Set<TaskStatus>(['backlog', 'completed']);

export interface TaskContextMenuActions {
  buildItems: (task: TaskContextMenuTarget) => NativeContextMenuItem[];
  installKeyboardHandlers: (task: TaskContextMenuTarget) => void;
  runTriageAction: (action: 'duplicate' | 'retriage', canonicalTaskId?: string) => Promise<void>;
}

export const useTaskContextMenuActions = (
  routeScope: TaskItemRouteScope = 'agent',
  onStatusChange?: (status: TaskStatus) => void | Promise<void>,
  triage?: TaskTriageMenuExtras,
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
    const runTriageAction = async (action: 'duplicate' | 'retriage', canonicalTaskId?: string) => {
      if (!triage) return;
      const input = buildTriageMutationInput(
        triage.triageTarget,
        triage.triageTarget.teamId,
        action,
        { canonicalTaskId },
      );
      if (!input) return;
      try {
        await workAttentionService.triage(input);
        await refreshTaskList();
      } catch (error) {
        toast.error(
          isTrpcErrorCode(error, 'CONFLICT')
            ? t('teams.transferConflict', { ns: 'common' })
            : t('taskDetail.updateFailed'),
        );
      }
    };

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

      // Linear's status submenu trails the selectable states with the same
      // intake actions the issue-page status menu carries: Duplicate gets the
      // next positional digit, Triage the dedicated '0' key.
      if (triage) {
        statusChildren.push(
          {
            extra: renderMenuExtra(String(USER_SELECTABLE_STATUSES.length + 1), false),
            icon: <Icon icon={CopySlashIcon} />,
            key: 'status-duplicate',
            label: t('savedViews.values.triageStatus.duplicate', { ns: 'common' }),
            disabled: !canEditTask,
            onClick: ({ domEvent }: MenuInfo) => {
              domEvent.stopPropagation();
              if (!canEditTask) return;
              triage.onOpenDuplicate();
            },
          } as ContextMenuItem,
          {
            extra: renderMenuExtra('0', false),
            icon: <Icon icon={InboxIcon} />,
            key: 'status-triage',
            label: t('taskDetail.workflow.category.triage'),
            disabled: !canEditTask,
            onClick: ({ domEvent }: MenuInfo) => {
              domEvent.stopPropagation();
              if (!canEditTask) return;
              void runTriageAction('retriage');
            },
          } as ContextMenuItem,
        );
      }

      const priorityChildren = PRIORITY_LEVELS.map((level) => {
        const meta = PRIORITY_META[level];
        const PriorityIcon = meta.icon;
        const isCurrent = level === currentPriority;
        return {
          // Linear labels its priority digits with the level value itself:
          // "No priority 0 / Urgent 1 / High 2 / Medium 3 / Low 4".
          extra: renderMenuExtra(String(level), isCurrent),
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
          // Priority digits are the level values themselves (0 = No priority).
          if (!PRIORITY_LEVELS.includes(num as (typeof PRIORITY_LEVELS)[number])) return;
          event.preventDefault();
          event.stopPropagation();
          const nextLevel = num;
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
          const extraCount = triage ? 2 : 0;
          const optionCount = USER_SELECTABLE_STATUSES.length + extraCount;
          // '0' is Linear's dedicated key for the trailing Triage entry.
          const statusIdx = num === 0 ? (triage ? optionCount - 1 : -1) : idx;
          if (statusIdx < 0 || statusIdx >= optionCount) return;
          event.preventDefault();
          event.stopPropagation();
          if (statusIdx < USER_SELECTABLE_STATUSES.length) {
            const nextStatus = USER_SELECTABLE_STATUSES[statusIdx];
            if (nextStatus !== currentStatus) {
              if (onStatusChange) void onStatusChange(nextStatus);
              else void changeTaskStatus(task.identifier, nextStatus);
            }
          } else if (statusIdx === USER_SELECTABLE_STATUSES.length) {
            triage?.onOpenDuplicate();
          } else {
            void runTriageAction('retriage');
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

    return { buildItems, installKeyboardHandlers, runTriageAction };
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
    triage,
  ]);
};

export const useTaskItemContextMenu = (
  task: TaskContextMenuTarget,
  routeScope?: TaskItemRouteScope,
  onStatusChange?: (status: TaskStatus) => void | Promise<void>,
): TaskItemContextMenu => {
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);

  const workspaceId = useActiveWorkspaceId();
  const triageTarget =
    task.id && task.teamId && task.domainRevision !== undefined
      ? { domainRevision: task.domainRevision, id: task.id, teamId: task.teamId }
      : undefined;
  const { data: teamData } = useClientDataSWR(
    triageTarget?.teamId && workspaceId ? ['team', workspaceId, triageTarget.teamId] : null,
    () => triageTarget && lambdaClient.team.team.query({ teamId: triageTarget.teamId }),
  );
  const triageCapable = teamData?.data.team.orchestrationPolicy?.triageEnabled !== false;
  const triage: TaskTriageMenuExtras | undefined =
    triageTarget && triageCapable
      ? { onOpenDuplicate: () => setDuplicateModalOpen(true), triageTarget }
      : undefined;

  const { buildItems, installKeyboardHandlers, runTriageAction } = useTaskContextMenuActions(
    routeScope,
    onStatusChange,
    triage,
  );
  const transferItems = useTaskTransferMenuItem(task.identifier) as ContextMenuItem[] | null;
  const items = useMemo(() => {
    const base = buildItems(task);
    if (!transferItems || transferItems.length === 0) return base;

    // Insert transfer/copy entries above the final divider + delete pair so
    // they sit next to the other lifecycle actions but kept distinct from
    // in-place state changes.
    const deleteAnchor = base.findIndex(
      (item) =>
        item !== null &&
        typeof item === 'object' &&
        'key' in item &&
        (item as { key?: string }).key === 'delete',
    );
    if (deleteAnchor === -1) return [...base, ...transferItems];

    const insertAt =
      deleteAnchor > 0 &&
      base[deleteAnchor - 1] !== null &&
      typeof base[deleteAnchor - 1] === 'object' &&
      'type' in (base[deleteAnchor - 1] as object) &&
      (base[deleteAnchor - 1] as { type?: string }).type === 'divider'
        ? deleteAnchor - 1
        : deleteAnchor;

    return [
      ...base.slice(0, insertAt),
      ...transferItems,
      { type: 'divider' } as ContextMenuItem,
      ...base.slice(deleteAnchor),
    ];
  }, [buildItems, task, transferItems]);
  const onContextMenu = useCallback(
    () => installKeyboardHandlers(task),
    [installKeyboardHandlers, task],
  );
  const duplicateModal = triageTarget ? (
    <MarkDuplicateModal
      open={duplicateModalOpen}
      taskId={triageTarget.id}
      onClose={() => setDuplicateModalOpen(false)}
      onConfirm={(_taskId, canonicalTaskId) => {
        setDuplicateModalOpen(false);
        void runTriageAction('duplicate', canonicalTaskId);
      }}
    />
  ) : undefined;
  return { duplicateModal, items, onContextMenu };
};
