import {
  CopyIcon,
  GitBranchIcon,
  HistoryIcon,
  MoreHorizontal,
  PlusIcon,
  RepeatIcon,
  StarIcon,
  Trash,
  UsersIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWorkFavoriteToggle } from '@/features/HomeSidebar/Body/useWorkFavoriteToggle';
import SidebarDropdownMenu, {
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
import { openTaskIssueResourceModal } from './createTaskIssueResourceModal';
import { openTaskDescriptionHistoryModal } from './TaskDescriptionHistoryModal';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';
import {
  type CreateIssueRelationKind,
  openTaskIssueDefinitionModal,
} from './TaskIssueDefinitionModal';
import { type MarkIssueRelationKind, openTaskIssueRelationModal } from './TaskIssueRelationModal';
import { openTaskPropertiesSetupModal } from './TaskPropertiesSetupModal';
import { useTaskCopyActions } from './useTaskCopyActions';
import { useTaskIssueDates } from './useTaskIssueDates';

const TaskDetailHeaderActions = () => {
  const { t } = useTranslation(['chat', 'common']);
  const navigate = useWorkspaceAwareNavigate();
  const activeWorkspaceId = useActiveWorkspaceId();
  const { allowed: canEditTask } = usePermission('create_content');
  const taskId = useTaskDetailTaskId();
  const task = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  const taskUuid = task?.id;
  const copy = useTaskCopyActions();
  const { pinned, toggle } = useWorkFavoriteToggle('task', taskUuid);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const refreshTaskDetail = useTaskStore((s) => s.internal_refreshTaskDetail);
  const refreshTaskList = useTaskStore((s) => s.refreshTaskList);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [teamQuery, setTeamQuery] = useState('');
  const {
    data: teams,
    error: teamError,
    isLoading: teamsLoading,
  } = useClientDataSWR(open && activeWorkspaceId ? ['project/teams'] : null, () =>
    projectService.teams(),
  );
  const { data: resources, mutate: refreshResources } = useClientDataSWR(
    open && taskUuid ? ['issue-resources', taskUuid] : null,
    () => taskMenuService.links(taskUuid!),
  );
  const { data: recurrence, mutate: refreshRecurrence } = useClientDataSWR(
    open && taskUuid ? ['task:recurrence', taskUuid] : null,
    () => taskMenuService.recurrence(taskUuid!),
  );
  const { dueDateItem, reminderItem, removeDates } = useTaskIssueDates({
    taskId,
    dueDate: task?.dueDate,
    canEdit: canEditTask,
    open,
    closeMenu: () => setOpen(false),
  });
  if (!taskId) return null;

  const editable = canEditTask && !!taskUuid && !!task?.domainRevision && !pending;
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
    if (!editable || !taskUuid || !task?.domainRevision || teamId === task.teamId) return;
    await apply(async () => {
      try {
        await taskService.moveToTeam({
          expectedDomainRevision: task.domainRevision!,
          taskId: taskUuid,
          teamId,
        });
        await refresh();
        toast.success(t('teams.transferUpdated', { ns: 'common' }));
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
      }
    });
  };
  const definition = (
    kind: 'copy' | 'related' | 'project' | 'template' | 'recurring',
    relationKind?: CreateIssueRelationKind,
  ) => {
    if (!editable || !taskUuid || !task?.domainRevision) return;
    openTaskIssueDefinitionModal({
      taskId: taskUuid,
      expectedDomainRevision: task.domainRevision,
      name: task.name,
      kind,
      relationKind,
      onChanged: refresh,
    });
  };
  const mark = (kind: MarkIssueRelationKind) => {
    if (!editable || !taskUuid || !task?.domainRevision) return;
    openTaskIssueRelationModal({
      taskId: taskUuid,
      expectedDomainRevision: task.domainRevision,
      kind,
      onChanged: refresh,
    });
  };
  const favoriteLabel = pinned
    ? t('taskList.contextMenu.unfavorite')
    : t('taskList.contextMenu.favorite');
  const filteredTeams = (teams?.data ?? []).filter((team) =>
    team.name.toLocaleLowerCase().includes(teamQuery.toLocaleLowerCase()),
  );
  const teamChildren: SidebarMenuItems = teamError
    ? [{ disabled: true, key: 'team-error', label: t('teams.transferFailed', { ns: 'common' }) }]
    : teamsLoading || !teams
      ? [{ disabled: true, key: 'team-loading', label: t('loading', { ns: 'common' }) }]
      : [
          {
            type: 'group',
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
            children: filteredTeams.length
              ? filteredTeams.map((team) => ({
                  disabled: !editable || team.id === task?.teamId,
                  extra: renderMenuCheck(team.id === task?.teamId),
                  key: `team-${team.id}`,
                  label: team.name,
                  onClick: () => void moveToTeam(team.id),
                }))
              : [{ disabled: true, key: 'team-empty', label: t('taskDetail.menu.noTeams') }],
          },
        ];
  const removeItems: SidebarMenuItemData[] = [];
  if (task?.duplicateOf)
    removeItems.push({
      key: 'remove-duplicate',
      label: t('taskDetail.menu.removeDuplicate'),
      extra: task.duplicateOf.identifier ?? t('taskDetail.menu.unavailable'),
      disabled: !editable,
      onClick: () =>
        void apply(async () => {
          await taskMenuService.clearDuplicate({
            id: taskUuid!,
            expectedDomainRevision: task.domainRevision!,
          });
          await refresh();
        }),
    });
  if (task?.parent)
    removeItems.push({
      key: 'remove-parent',
      label: t('taskDetail.menu.removeParent'),
      extra: task.parent.identifier,
      disabled: !editable,
      onClick: () =>
        void apply(async () => {
          await taskService.update(taskUuid!, {
            parentTaskId: null,
            expectedDomainRevision: task.domainRevision,
          });
          await refresh();
        }),
    });
  for (const child of task?.subtasks ?? [])
    removeItems.push({
      key: `remove-child-${child.identifier}`,
      label: t('taskDetail.menu.removeSubIssue'),
      extra: child.identifier,
      disabled: !editable,
      onClick: () =>
        void apply(async () => {
          const target = await taskService.getDetail(child.identifier);
          await taskService.update(child.identifier, {
            parentTaskId: null,
            expectedDomainRevision: target.data.domainRevision,
          });
          await refresh();
        }),
    });
  for (const edge of task?.dependencies ?? [])
    removeItems.push({
      key: `remove-relation-${edge.relationId ?? edge.dependsOn}-${edge.direction ?? edge.type}`,
      label: t(
        edge.type === 'relates'
          ? 'taskDetail.menu.removeRelated'
          : edge.direction === 'blocking'
            ? 'taskDetail.menu.removeBlocked'
            : 'taskDetail.menu.removeBlocking',
      ),
      extra: edge.dependsOn,
      disabled: !editable,
      onClick: () =>
        void apply(async () => {
          if (edge.relationId) await taskService.removeIssueRelation(taskUuid!, edge.relationId);
          else if (edge.direction === 'blocking')
            await taskService.removeDependency(edge.id ?? edge.dependsOn, taskUuid!, 'blocks');
          else
            await taskService.removeDependency(
              taskUuid!,
              edge.id ?? edge.dependsOn,
              edge.type === 'relates' ? 'relates' : 'blocks',
            );
          await refresh();
        }),
    });
  for (const link of resources?.data ?? [])
    removeItems.push({
      key: `remove-link-${link.id}`,
      label: link.title ?? link.url,
      disabled: !editable,
      onClick: () =>
        void apply(async () => {
          await taskMenuService.removeLink(taskUuid!, link.id);
          await refresh();
        }),
    });
  removeItems.push(...removeDates);
  if (recurrence?.data) {
    removeItems.push({
      key: 'toggle-recurrence',
      label: t(
        recurrence.data.enabled
          ? 'taskDetail.menu.pauseRecurrence'
          : 'taskDetail.menu.resumeRecurrence',
      ),
      disabled: !editable,
      onClick: () =>
        void apply(async () => {
          await taskMenuService.setRecurrenceEnabled({
            id: taskUuid!,
            enabled: !recurrence.data!.enabled,
          });
          await refresh();
        }),
    });
    removeItems.push({
      key: 'remove-recurrence',
      label: t('taskDetail.menu.removeRecurrence'),
      disabled: !editable,
      onClick: () =>
        void apply(async () => {
          await taskMenuService.removeRecurrence(taskUuid!);
          await refresh();
        }),
    });
  }
  const clipboard = [
    ['copyId', 'copyId', copy.copyId],
    ['copyLink', 'copyURL', copy.copyLink],
    ['copyTitle', 'copyTitle', copy.copyTitle],
    ['copyTitleAsLink', 'copyTitleAsLink', copy.copyTitleAsLink],
    ['copyMarkdown', 'copyIssueMarkdown', copy.copyMarkdown],
    ['copyEverything', 'copyEverything', copy.copyEverything],
    ...(copy.hasBranch ? [['copyBranch', 'copyBranch', copy.copyBranch] as const] : []),
    ['copyPrompt', 'copyPrompt', copy.copyPrompt],
  ] as const;
  const items: SidebarMenuItems = [
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
      key: 'propertiesSetup',
      label: t('taskDetail.menu.propertiesSetup'),
      disabled: !editable,
      onClick: () => {
        if (editable) openTaskPropertiesSetupModal({ taskId });
      },
    },
    dueDateItem,
    ...(['link', 'pull_request', 'document'] as const).map((kind) => ({
      key: `add-${kind}`,
      disabled: !editable,
      label: t(`taskDetail.menu.add.${kind}`),
      onClick: () => {
        if (editable && taskUuid)
          openTaskIssueResourceModal({ taskId: taskUuid, kind, onChanged: refresh });
      },
    })),

    { type: 'divider' },
    {
      key: 'createRelated',
      label: t('taskDetail.menu.createRelated'),
      icon: <PlusIcon />,
      disabled: !editable,
      children: (['related', 'sub_issue', 'parent', 'blocked', 'blocking'] as const).map(
        (kind) => ({
          key: `create-${kind}`,
          label: t(`taskDetail.menu.create.${kind}`),
          onClick: () => definition('related', kind),
        }),
      ),
    },
    {
      key: 'markAs',
      label: t('taskDetail.menu.markAs'),
      icon: <GitBranchIcon />,
      disabled: !editable,
      children: (
        ['parentOf', 'subIssueOf', 'relatedTo', 'blockedBy', 'blocking', 'duplicateOf'] as const
      ).map((kind) => ({
        key: `mark-${kind}`,
        label: t(`taskDetail.menu.mark.${kind}`),
        extra:
          kind === 'duplicateOf' && task?.duplicateOf
            ? (task.duplicateOf.identifier ?? t('taskDetail.menu.unavailable'))
            : undefined,
        onClick: () => mark(kind),
      })),
    },
    {
      key: 'remove',
      label: t('taskDetail.menu.remove'),
      disabled: removeItems.length === 0 || pending,
      children: removeItems,
    },
    { type: 'divider' },
    {
      key: 'copy',
      label: t('taskList.contextMenu.copy'),
      icon: <CopyIcon />,
      children: clipboard.map(([key, label, action]) => ({
        key,
        label: t(`taskDetail.menu.${label}`),
        onClick: () => void apply(action),
      })),
    },
    {
      key: 'convertTo',
      label: t('taskDetail.menu.convertTo'),
      icon: <RepeatIcon />,
      disabled: !editable,
      children: (['project', 'template', 'recurring'] as const).map((kind) => ({
        key: `convert-${kind}`,
        label: t(`taskDetail.menu.convert.${kind}`),
        onClick: () => definition(kind),
      })),
    },
    {
      key: 'makeCopy',
      label: t('taskDetail.menu.makeCopy'),
      icon: <CopyIcon />,
      disabled: !editable,
      onClick: () => definition('copy'),
    },
    { type: 'divider' },
    {
      disabled: !taskUuid,
      icon: <StarIcon fill={pinned ? 'currentColor' : 'none'} />,
      key: 'favorite',
      label: favoriteLabel,
      onClick: () => void toggle(),
    },
    reminderItem,
    { type: 'divider' },
    {
      key: 'descriptionHistory',
      label: t('taskDetail.menu.descriptionHistory'),
      icon: <HistoryIcon />,
      disabled: !taskUuid,
      onClick: () => {
        if (taskUuid)
          openTaskDescriptionHistoryModal({
            taskId: taskUuid,
            identifier: task?.identifier ?? taskId,
            canEdit: canEditTask,
            onChanged: refresh,
          });
      },
    },
    {
      danger: true,
      disabled: !editable,
      icon: <Trash />,
      key: 'delete',
      label: t('delete', { ns: 'common' }),
      onClick: () => {
        if (!editable) return;
        confirmModal({
          content: t('taskDetail.deleteConfirm.content'),
          okButtonProps: { danger: true },
          okText: t('taskDetail.deleteConfirm.ok'),
          title: t('taskDetail.deleteConfirm.title'),
          onOk: async () => {
            await deleteTask(taskId);
            navigate('/tasks');
          },
        });
      },
    },
  ];
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        aria-label={favoriteLabel}
        disabled={!taskUuid}
        size="icon-sm"
        title={favoriteLabel}
        variant="ghost"
        onClick={() => void toggle()}
      >
        <StarIcon aria-hidden fill={pinned ? 'currentColor' : 'none'} />
      </Button>
      <SidebarDropdownMenu items={items} open={open} onOpenChange={setOpen}>
        <Button aria-label={t('taskDetail.menu.actions')} size="icon-sm" variant="ghost">
          <MoreHorizontal aria-hidden />
        </Button>
      </SidebarDropdownMenu>
    </div>
  );
};

export default TaskDetailHeaderActions;
