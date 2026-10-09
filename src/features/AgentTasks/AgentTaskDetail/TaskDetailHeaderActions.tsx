import {
  CopyIcon,
  CopyPlusIcon,
  GitBranchIcon,
  GitPullRequestIcon,
  HistoryIcon,
  LinkIcon,
  MoreHorizontal,
  PanelTopIcon,
  PlusIcon,
  RepeatIcon,
  SlidersHorizontalIcon,
  Trash,
  UnlinkIcon,
  UsersIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useTaskTransferMenuItem } from '@/business/client/hooks/useTaskTransferMenuItem';
import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { appNavigate } from '@/features/Electron/navigation/appNavigate';
import { FAVORITE_MARK, FAVORITE_MARK_OFF } from '@/features/HomeSidebar/Body/favoriteIcons';
import { useWorkFavoriteToggle } from '@/features/HomeSidebar/Body/useWorkFavoriteToggle';
import SidebarDropdownMenu, {
  type SidebarDropdownMenuProps,
  type SidebarMenuItemData,
  type SidebarMenuItems,
} from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { isWorkQueryTaskRowsKey } from '@/libs/swr/keys';
import { projectService } from '@/services/project';
import { taskService } from '@/services/task';
import { taskMenuService } from '@/services/taskMenu';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';
import { isTrpcErrorCode, trpcErrorMessage } from '@/utils/trpcError';

import { renderMenuCheck } from '../features/menuExtra';
import { useIssueStatusMove } from '../features/useIssueStatusMove';
import { openTaskIssueResourceModal } from './createTaskIssueResourceModal';
import { issueResourceRef } from './issueResourceRef';
import { relationKindOf } from './relationGroups';
import { openTaskDescriptionHistoryModal } from './TaskDescriptionHistoryModal';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';
import {
  type CreateIssueRelationKind,
  openTaskIssueDefinitionModal,
} from './TaskIssueDefinitionModal';
import { type MarkIssueRelationKind, openTaskIssueRelationModal } from './TaskIssueRelationModal';
import { openTaskPropertiesSetupModal } from './TaskPropertiesSetupModal';
import { ISSUE_RESOURCE_KINDS } from './useIssueDetailActions';
import { useTaskCopyActions } from './useTaskCopyActions';
import { useTaskIssueDates } from './useTaskIssueDates';

// Each entry names the issue on the far side of the edge, not the edge itself.
const REMOVE_RELATION_LABEL = {
  blockedBy: 'taskDetail.menu.removeBlocking',
  blocking: 'taskDetail.menu.removeBlocked',
  relates: 'taskDetail.menu.removeRelated',
} as const;

const CREATE_RELATED_KINDS = ['related', 'sub_issue', 'parent', 'blocked', 'blocking'] as const;
const MARK_AS_KINDS = [
  'parentOf',
  'subIssueOf',
  'relatedTo',
  'blockedBy',
  'blocking',
  'duplicateOf',
] as const;
const CONVERT_KINDS = ['project', 'template', 'recurring'] as const;

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
 * The issue header's favourite star and overflow menu. Everything reads the
 * task from `TaskDetailScope`, so a routed detail and a portal detail mounted
 * side by side each act on their own issue.
 *
 * Definition commands (copy, create related, convert, mark duplicate) and the
 * attached-resource commands go through `taskMenu`; each carries the issue's
 * observed `domainRevision`, so they stay disabled until the detail has one.
 */
const TaskDetailHeaderActions = ({ onDeleted }: { onDeleted?: () => void }) => {
  const { t } = useTranslation(['chat', 'common', 'topic']);

  const navigate = useWorkspaceAwareNavigate();
  const activeWorkspaceId = useActiveWorkspaceId();
  const { allowed: canEditTask } = usePermission('create_content');
  const taskId = useTaskDetailTaskId();
  const copy = useTaskCopyActions();
  const task = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  const taskUuid = task?.id;
  // Links/PRs use the exact database id, including legacy ids (see issueResourceRef).
  const resourceRef = issueResourceRef(task);
  const domainRevision = task?.domainRevision;
  const isClosed = task?.workflowCategory === 'canceled' || task?.workflowCategory === 'done';

  const relationRemoveItems = useTaskRemoveMenuItems(taskId, !canEditTask);
  const moveWorkflow = useIssueStatusMove();
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const refreshTaskDetail = useTaskStore((s) => s.internal_refreshTaskDetail);
  const refreshTaskList = useTaskStore((s) => s.refreshTaskList);
  const transferItems = useTaskTransferMenuItem(taskId) as SidebarDropdownMenuProps['items'] | null;
  // The favourite is keyed by the task UUID — the same id board cards toggle.
  const { pinned, toggle: toggleFavorite } = useWorkFavoriteToggle('task', taskUuid);

  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [teamQuery, setTeamQuery] = useState('');

  // Menu-only reads wait for the menu to open.
  const {
    data: teams,
    error: teamError,
    isLoading: teamsLoading,
  } = useClientDataSWR(open && activeWorkspaceId ? ['project/teams'] : null, () =>
    projectService.teams(),
  );
  const { data: resources, mutate: refreshResources } = useClientDataSWR(
    open && resourceRef ? ['issue-resources', resourceRef] : null,
    () => taskMenuService.links(resourceRef!),
  );
  const { data: recurrence, mutate: refreshRecurrence } = useClientDataSWR(
    open && taskUuid ? ['task:recurrence', taskUuid] : null,
    () => taskMenuService.recurrence(taskUuid!),
  );
  const { dueDateItem, reminderItem, removeDates } = useTaskIssueDates({
    canEdit: canEditTask,
    closeMenu: () => setOpen(false),
    dueDate: task?.dueDate,
    open,
    taskId,
  });

  if (!taskId) return null;

  const editable = canEditTask && !!taskUuid && !!domainRevision && !pending;

  const refresh = async () => {
    await Promise.all([
      refreshTaskDetail(taskId),
      refreshTaskList(),
      refreshResources(),
      refreshRecurrence(),
      mutate(
        (key) =>
          isWorkQueryTaskRowsKey(key) ||
          (Array.isArray(key) && key[0] === 'team-triage' && key[1] === activeWorkspaceId),
      ),
    ]);
  };
  // One write at a time; a failure is reported, never presented as done.
  const apply = async (operation: () => Promise<unknown>) => {
    if (pending) return;
    setPending(true);
    try {
      await operation();
    } catch (error) {
      toast.error(trpcErrorMessage(error) ?? t('taskDetail.menu.failed'));
    } finally {
      setPending(false);
    }
  };

  const moveToTeam = async (teamId: string) => {
    if (!editable || teamId === task?.teamId) return;
    await apply(async () => {
      try {
        await taskService.moveToTeam({
          expectedDomainRevision: domainRevision!,
          taskId: taskUuid!,
          teamId,
        });
      } catch (error) {
        toast.error(
          t(
            isTrpcErrorCode(error, 'CONFLICT')
              ? 'teams.transferConflict'
              : isTrpcErrorCode(error, 'PRECONDITION_FAILED')
                ? 'teams.transferLinear'
                : 'teams.transferFailed',
            { ns: 'common' },
          ),
        );
        return;
      }
      await refresh();
      toast.success(t('teams.transferUpdated', { ns: 'common' }));
    });
  };
  const openDefinition = (
    kind: 'copy' | 'related' | 'project' | 'template' | 'recurring',
    relationKind?: CreateIssueRelationKind,
  ) => {
    if (!editable) return;
    openTaskIssueDefinitionModal({
      expectedDomainRevision: domainRevision!,
      kind,
      name: task?.name,
      onChanged: refresh,
      relationKind,
      taskId: taskUuid!,
    });
  };
  const openMarkAs = (kind: MarkIssueRelationKind) => {
    if (!editable) return;
    openTaskIssueRelationModal({
      expectedDomainRevision: domainRevision!,
      kind,
      onChanged: refresh,
      taskId: taskUuid!,
    });
  };

  // ── Team ────────────────────────────────────────────────────────────────
  const filteredTeams = (teams?.data ?? []).filter((team) =>
    team.name.toLocaleLowerCase().includes(teamQuery.toLocaleLowerCase()),
  );
  // A failed or still-loading directory never renders a selectable team.
  const teamChildren: SidebarMenuItems = teamError
    ? [{ disabled: true, key: 'team-error', label: t('teams.transferFailed', { ns: 'common' }) }]
    : teamsLoading || !teams
      ? [{ disabled: true, key: 'team-loading', label: t('loading', { ns: 'common' }) }]
      : [
          {
            children: filteredTeams.length
              ? filteredTeams.map((team) => ({
                  disabled: !editable || team.id === task?.teamId,
                  extra: renderMenuCheck(team.id === task?.teamId),
                  key: `team-${team.id}`,
                  label: team.name,
                  onClick: () => void moveToTeam(team.id),
                }))
              : [{ disabled: true, key: 'team-empty', label: t('taskDetail.menu.noTeams') }],
            label: (
              <Input
                aria-label={t('taskDetail.menu.searchTeams')}
                placeholder={t('taskDetail.menu.searchTeams')}
                value={teamQuery}
                onChange={(event) => setTeamQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') event.stopPropagation();
                }}
              />
            ),
            type: 'group',
          },
        ];

  // ── Remove ──────────────────────────────────────────────────────────────
  // Only what the issue actually has: its duplicate target, parent, sub-issues
  // and relations, attached links, dates and recurrence.
  const removeItems: SidebarMenuItemData[] = [];
  if (task?.duplicateOf)
    removeItems.push({
      disabled: !editable,
      extra: task.duplicateOf.identifier ?? t('taskDetail.menu.unavailable'),
      key: 'remove-duplicate',
      label: t('taskDetail.menu.removeDuplicate'),
      onClick: () =>
        void apply(async () => {
          await taskMenuService.clearDuplicate({
            expectedDomainRevision: domainRevision!,
            id: taskUuid!,
          });
          await refresh();
        }),
    });
  removeItems.push(...relationRemoveItems);
  for (const link of resources?.data ?? [])
    removeItems.push({
      disabled: !editable,
      icon: link.kind === 'pull_request' ? <GitPullRequestIcon /> : <LinkIcon />,
      key: `remove-link-${link.id}`,
      label: link.title ?? link.url,
      onClick: () =>
        void apply(async () => {
          await taskMenuService.removeLink(resourceRef!, link.id);
          await refresh();
        }),
    });
  removeItems.push(...removeDates);
  if (recurrence?.data) {
    const { enabled } = recurrence.data;
    removeItems.push(
      {
        disabled: !editable,
        key: 'toggle-recurrence',
        label: t(enabled ? 'taskDetail.menu.pauseRecurrence' : 'taskDetail.menu.resumeRecurrence'),
        onClick: () =>
          void apply(async () => {
            await taskMenuService.setRecurrenceEnabled({ enabled: !enabled, id: taskUuid! });
            await refresh();
          }),
      },
      {
        disabled: !editable,
        key: 'remove-recurrence',
        label: t('taskDetail.menu.removeRecurrence'),
        onClick: () =>
          void apply(async () => {
            await taskMenuService.removeRecurrence(taskUuid!);
            await refresh();
          }),
      },
    );
  }

  // ── Copy ────────────────────────────────────────────────────────────────
  // Clipboard actions fold into one submenu so the top level stays short;
  // "copy git branch" joins only for real workspace-bound tasks (see
  // `useTaskCopyActions`). Readers keep all of them.
  const clipboard = [
    ['copyId', t('taskList.contextMenu.copyId'), copy.copyId],
    ['copyLink', t('taskList.contextMenu.copyLink'), copy.copyLink],
    ['copyTitle', t('taskList.contextMenu.copyIssueTitle'), copy.copyTitle],
    ['copyTitleAsLink', t('taskList.contextMenu.copyTitleAsLink'), copy.copyTitleAsLink],
    ['copyMarkdown', t('taskList.contextMenu.copyMarkdown'), copy.copyMarkdown],
    ['copyEverything', t('taskDetail.menu.copyEverything'), copy.copyEverything],
    ...(copy.hasBranch
      ? [['copyBranch', t('taskDetail.copyBranch'), copy.copyBranch] as const]
      : []),
    ['copyPrompt', t('taskDetail.menu.copyPrompt'), copy.copyPrompt],
  ] as const;

  // The terminal toggle: cancel an open issue, or put a closed one back in
  // Todo. Both go through the shared status command, which reports its own
  // failures — and Todo never auto-starts a run.
  // The glyph is the board's own mark for the state the click lands in.
  const closeTarget = isClosed ? 'todo' : 'canceled';
  const CloseTargetIcon = WORKFLOW_CATEGORY_VISUALS[closeTarget].icon;
  const resolvedTransferItems =
    typeof transferItems === 'function' ? transferItems() : transferItems;
  const favoriteLabel = pinned
    ? t('taskList.contextMenu.unfavorite')
    : t('taskList.contextMenu.favorite');
  const FavoriteGlyph = pinned ? FAVORITE_MARK_OFF.star : FAVORITE_MARK.star;

  const items: SidebarMenuItems = [
    // The host adapter decides what a tab is: an app tab on desktop, a browser
    // tab on web.
    {
      icon: <PanelTopIcon />,
      key: 'openInNewTab',
      label: t('actions.openInNewTab', { ns: 'topic' }),
      onClick: () => appNavigate(copy.taskPath, { target: 'newTab' }),
    },
    { type: 'divider' },
    ...(activeWorkspaceId
      ? [
          {
            children: teamChildren,
            disabled: !editable,
            icon: <UsersIcon />,
            key: 'team',
            label: t('taskDetail.menu.team'),
          },
        ]
      : []),
    {
      disabled: !editable,
      icon: <SlidersHorizontalIcon />,
      key: 'propertiesSetup',
      label: t('taskDetail.menu.propertiesSetup'),
      onClick: () => {
        if (editable) openTaskPropertiesSetupModal({ taskId });
      },
    },
    dueDateItem,
    ...ISSUE_RESOURCE_KINDS.map(([kind, Icon]) => ({
      disabled: !editable,
      icon: <Icon />,
      key: `add-${kind}`,
      label: t(`taskDetail.menu.add.${kind}`),
      onClick: () => {
        if (editable)
          openTaskIssueResourceModal({ kind, onChanged: refresh, taskId: resourceRef! });
      },
    })),
    { type: 'divider' },
    {
      children: CREATE_RELATED_KINDS.map((kind) => ({
        key: `create-${kind}`,
        label: t(`taskDetail.menu.create.${kind}`),
        onClick: () => openDefinition('related', kind),
      })),
      disabled: !editable,
      icon: <PlusIcon />,
      key: 'createRelated',
      label: t('taskDetail.menu.createRelated'),
    },
    {
      children: MARK_AS_KINDS.map((kind) => ({
        extra:
          kind === 'duplicateOf' && task?.duplicateOf
            ? (task.duplicateOf.identifier ?? t('taskDetail.menu.unavailable'))
            : undefined,
        key: `mark-${kind}`,
        label: t(`taskDetail.menu.mark.${kind}`),
        onClick: () => openMarkAs(kind),
      })),
      disabled: !editable,
      icon: <GitBranchIcon />,
      key: 'markAs',
      label: t('taskDetail.menu.markAs'),
    },
    // Nothing removable → no Remove entry at all, rather than a dead submenu.
    removeItems.length
      ? {
          children: removeItems,
          disabled: pending,
          icon: <UnlinkIcon />,
          key: 'remove',
          label: t('taskDetail.menu.remove'),
        }
      : null,
    { type: 'divider' },
    {
      children: clipboard.map(([key, label, action]) => ({
        key,
        label,
        onClick: () => void apply(action),
      })),
      icon: <CopyIcon />,
      key: 'copy',
      label: t('taskList.contextMenu.copy'),
    },
    {
      children: CONVERT_KINDS.map((kind) => ({
        key: `convert-${kind}`,
        label: t(`taskDetail.menu.convert.${kind}`),
        onClick: () => openDefinition(kind),
      })),
      disabled: !editable,
      icon: <RepeatIcon />,
      key: 'convertTo',
      label: t('taskDetail.menu.convertTo'),
    },
    {
      disabled: !editable,
      icon: <CopyPlusIcon />,
      key: 'makeCopy',
      label: t('taskDetail.menu.makeCopy'),
      onClick: () => openDefinition('copy'),
    },
    { type: 'divider' },
    // Favourite and reminder are the reader's own rows — never write-gated.
    {
      disabled: !taskUuid,
      icon: <FavoriteGlyph />,
      key: 'favorite',
      label: favoriteLabel,
      onClick: () => void toggleFavorite(),
    },
    reminderItem,
    { type: 'divider' },
    ...(resolvedTransferItems?.length ? [...resolvedTransferItems, { type: 'divider' }] : []),
    {
      disabled: !canEditTask,
      icon: <CloseTargetIcon color={WORKFLOW_CATEGORY_VISUALS[closeTarget].color} />,
      key: isClosed ? 'reopen' : 'cancel',
      label: t(isClosed ? 'taskDetail.menu.reopen' : 'taskDetail.menu.cancel'),
      onClick: () =>
        void moveWorkflow({
          target: { category: closeTarget },
          taskIdentifier: taskId,
        }).catch(() => {}),
    },
    { type: 'divider' },
    {
      disabled: !taskUuid,
      icon: <HistoryIcon />,
      key: 'descriptionHistory',
      label: t('taskDetail.menu.descriptionHistory'),
      onClick: () => {
        if (taskUuid)
          openTaskDescriptionHistoryModal({
            canEdit: canEditTask,
            identifier: task?.identifier ?? taskId,
            onChanged: refresh,
            taskId: taskUuid,
          });
      },
    },
    {
      danger: true,
      disabled: !canEditTask,
      icon: <Trash />,
      key: 'delete',
      label: t('delete', { ns: 'common' }),
      onClick: () => {
        if (!canEditTask) return;
        confirmModal({
          content: t('taskDetail.deleteConfirm.content'),
          okButtonProps: { danger: true },
          okText: t('taskDetail.deleteConfirm.ok'),
          onOk: async () => {
            await deleteTask(taskId);
            // A peek host closes its own pane; the full page goes back to the list.
            if (onDeleted) onDeleted();
            else navigate('/tasks');
          },
          title: t('taskDetail.deleteConfirm.title'),
        });
      },
    },
  ];

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        aria-label={favoriteLabel}
        aria-pressed={pinned}
        disabled={!taskUuid}
        size="icon-sm"
        title={favoriteLabel}
        variant="ghost"
        onClick={() => void toggleFavorite()}
      >
        <FavoriteGlyph aria-hidden />
      </Button>
      <SidebarDropdownMenu items={items} open={open} onOpenChange={setOpen}>
        <Button
          aria-label={t('taskDetail.menu.actions')}
          size="icon-sm"
          title={t('taskDetail.menu.actions')}
          variant="ghost"
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </SidebarDropdownMenu>
    </div>
  );
};

export default TaskDetailHeaderActions;
