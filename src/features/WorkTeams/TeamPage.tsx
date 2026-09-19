'use client';

import { Center, Empty, Flexbox } from '@lobehub/ui';
import {
  ActionIcon,
  Button,
  type DropdownItem,
  DropdownMenu,
  Segmented,
  Select,
  Text,
  toast,
} from '@lobehub/ui/base-ui';
import type { WorkQueryLayout } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { FolderXIcon, ListChecksIcon, MoreHorizontalIcon, UsersIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import { resolveTaskStatus } from '@/components/ExecutionStatus';
import TaskStatusIcon from '@/features/AgentTasks/features/TaskStatusIcon';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import WorkFavoriteButton from '@/features/HomeSidebar/Body/WorkFavoriteButton';
import { mergeWorkQueryGroups, mergeWorkQueryPage } from '@/features/MyWork/workQueryPaging';
import WorkQueryResults from '@/features/MyWork/WorkQueryResults';
import NavHeader from '@/features/NavHeader';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { SavedViewProjectRow } from '@/features/SavedViews/SavedViewPage';
import WideScreenContainer from '@/features/WideScreenContainer';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useSearchParams } from '@/libs/router/navigation';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { lambdaClient } from '@/libs/trpc/client';
import { workAttentionService } from '@/services/workAttention';
import { isTrpcErrorCode } from '@/utils/trpcError';

import { duplicateCanonicalOptions } from './duplicateCanonicalOptions';
import { otherTeamOptions } from './otherTeamOptions';
import { reassignMemberOptions } from './reassignMemberOptions';
import { teamSurfaceState } from './teamSurfaceState';
import {
  TEAM_TRIAGE_OVERFLOW_I18N,
  type TeamTriageOverflowItem,
  teamTriageOverflowItems,
} from './teamTriageOverflow';
import { ALL_TEAM_CYCLES, teamTaskQuery, teamTriageQuery } from './teamWorkQuery';

const styles = createStaticStyles(({ css }) => ({
  actions: css`
    flex: none;
  `,
  identifier: css`
    flex: none;

    min-width: 64px;

    font-family: ${cssVar.fontFamilyCode};
    color: ${cssVar.colorTextTertiary};
    text-align: end;
  `,
  link: css`
    display: flex;
    flex: 1;
    gap: 8px;
    align-items: center;

    min-width: 0;

    color: inherit;
    text-decoration: none;
  `,
  row: css`
    padding-block: 7px;
    padding-inline: 4px 12px;
    border-radius: ${cssVar.borderRadiusLG};
    color: inherit;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

type TeamTriageTask = {
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  domainRevision?: number;
  id: string;
  identifier?: string | null;
  instruction?: string | null;
  name?: string | null;
  status?: string | null;
};

const TeamTriageRow = memo<{
  canonicals: Array<{ label: string; value: string }>;
  destinations: Array<{ label: string; value: string }>;
  members: Array<{ userId: string }>;
  onAccept: (taskId: string) => void;
  onDecline: (taskId: string) => void;
  onDuplicate: (taskId: string, canonicalTaskId: string) => void;
  onReassign: (taskId: string, assigneeUserId: string) => void;
  onTransferred: () => void;
  task: TeamTriageTask;
}>(
  ({
    canonicals,
    destinations,
    members,
    onAccept,
    onDecline,
    onDuplicate,
    onReassign,
    onTransferred,
    task,
  }) => {
    const { t } = useTranslation('common');
    const memberOptions = reassignMemberOptions(members, task.assigneeUserId);
    const overflowItems = teamTriageOverflowItems({
      canonicals,
      destinations,
      members: memberOptions,
    });

    const transfer = useCallback(
      async (teamId: string) => {
        if (!teamId || task.domainRevision === undefined) return;
        try {
          await lambdaClient.team.moveTaskToTeam.mutate({
            expectedDomainRevision: task.domainRevision,
            taskId: task.id,
            teamId,
          });
          onTransferred();
          toast.success(t('teams.transferUpdated'));
        } catch (error) {
          toast.error(
            isTrpcErrorCode(error, 'CONFLICT')
              ? t('teams.transferConflict')
              : isTrpcErrorCode(error, 'PRECONDITION_FAILED')
                ? t('teams.transferLinear')
                : t('teams.transferFailed'),
          );
        }
      },
      [onTransferred, t, task.domainRevision, task.id],
    );

    const runOverflow = useCallback(
      (kind: TeamTriageOverflowItem['kind'], value: string) => {
        if (kind === 'duplicate') onDuplicate(task.id, value);
        else if (kind === 'reassign') onReassign(task.id, value);
        else void transfer(value);
      },
      [onDuplicate, onReassign, task.id, transfer],
    );

    const overflowMenuItems = useMemo<DropdownItem[]>(
      () =>
        overflowItems.map((item) =>
          item.type === 'leaf'
            ? {
                key: item.kind,
                label: t(TEAM_TRIAGE_OVERFLOW_I18N[item.kind]),
                onClick: () => runOverflow(item.kind, item.value),
              }
            : {
                children: item.options.map((option) => ({
                  key: `${item.kind}-${option.value}`,
                  label: option.label,
                  onClick: () => runOverflow(item.kind, option.value),
                })),
                key: item.kind,
                label: t(TEAM_TRIAGE_OVERFLOW_I18N[item.kind]),
                type: 'submenu',
              },
        ),
      [overflowItems, runOverflow, t],
    );

    return (
      <Flexbox horizontal align="center" className={styles.row} gap={8}>
        <WorkspaceLink
          className={styles.link}
          to={taskDetailPath(task.id, task.assigneeAgentId ?? undefined, task.name)}
        >
          <TaskStatusIcon size={16} status={resolveTaskStatus(task.status)} />
          <Flexbox flex={1} style={{ minWidth: 0 }}>
            <Text ellipsis weight={500}>
              {task.name ?? task.instruction}
            </Text>
          </Flexbox>
          {task.identifier ? (
            <Text className={styles.identifier} fontSize={12}>
              {task.identifier}
            </Text>
          ) : null}
        </WorkspaceLink>
        <Flexbox horizontal align="center" className={styles.actions} gap={4}>
          <Button size="small" type="primary" onClick={() => onAccept(task.id)}>
            {t('teams.accept')}
          </Button>
          <Button size="small" onClick={() => onDecline(task.id)}>
            {t('teams.decline')}
          </Button>
          {overflowMenuItems.length > 0 ? (
            <DropdownMenu items={overflowMenuItems} placement="bottomRight">
              <ActionIcon icon={MoreHorizontalIcon} size="small" title={t('teams.moreActions')} />
            </DropdownMenu>
          ) : null}
        </Flexbox>
      </Flexbox>
    );
  },
);

TeamTriageRow.displayName = 'TeamTriageRow';

const TeamPage = memo(() => {
  const { t } = useTranslation('common');
  const { teamId } = useParams<{ teamId: string }>();
  const workspaceId = useActiveWorkspaceId();
  const [searchParams] = useSearchParams();
  // Linear's per-team sub-navigation lands here: home (triage + work),
  // triage, issues, projects and views each get their own tab surface.
  const teamTab = searchParams.get('tab') ?? 'home';
  const [cycleId, setCycleId] = useState(ALL_TEAM_CYCLES);
  const [noProject, setNoProject] = useState(false);
  const [layout, setLayout] = useState<WorkQueryLayout>('list');
  const {
    data: teamData,
    error: teamError,
    mutate: revalidateTeam,
  } = useClientDataSWR(teamId && workspaceId ? ['team', workspaceId, teamId] : null, () =>
    lambdaClient.team.team.query({ teamId: teamId! }),
  );
  const { data: teamsData } = useClientDataSWR(
    workspaceId ? workAttentionKeys.teams(workspaceId) : null,
    () => lambdaClient.team.teams.query(),
  );
  const wantsTriage = teamTab === 'home' || teamTab === 'triage';
  const wantsTasks = teamTab === 'home' || teamTab === 'issues';
  const {
    data: triageData,
    error: triageError,
    isLoading,
    mutate: revalidateTriage,
  } = useClientDataSWR(
    wantsTriage && teamId && workspaceId
      ? ['team-triage', workspaceId, teamId, cycleId, noProject]
      : null,
    () =>
      workAttentionService.query({
        query: teamTriageQuery(teamId!, cycleId, noProject),
      }),
  );
  const {
    data: teamTasksData,
    error: teamTasksError,
    isLoading: isTeamTasksLoading,
    mutate: revalidateTeamTasks,
  } = useClientDataSWR(
    wantsTasks && teamId && workspaceId
      ? ['team-tasks', workspaceId, teamId, cycleId, noProject, layout]
      : null,
    () =>
      workAttentionService.query({
        query: teamTaskQuery(teamId!, cycleId, noProject, layout),
      }),
  );
  const {
    data: teamProjectsData,
    error: teamProjectsError,
    isLoading: isTeamProjectsLoading,
    mutate: revalidateTeamProjects,
  } = useClientDataSWR(
    teamTab === 'projects' && teamId && workspaceId ? ['team-projects', workspaceId, teamId] : null,
    () =>
      workAttentionService.query({
        query: {
          entityType: 'project',
          filter: { all: [{ field: 'teamId', op: 'eq', value: teamId! }] },
          schemaVersion: 1,
        },
      }),
  );
  const {
    data: teamViewsData,
    error: teamViewsError,
    isLoading: isTeamViewsLoading,
    mutate: revalidateTeamViews,
  } = useClientDataSWR(
    teamTab === 'views' && workspaceId ? workAttentionKeys.savedViews(workspaceId) : null,
    () => workAttentionService.savedViewList(),
  );
  const teamProjects =
    teamProjectsData?.data && 'projects' in teamProjectsData.data
      ? (teamProjectsData.data.projects ?? [])
      : [];
  const teamViews = (teamViewsData?.data ?? []).filter(
    (view) => view.visibility === 'team' && view.teamId === teamId,
  );
  const firstTeamTasks =
    teamTasksData?.data && 'tasks' in teamTasksData.data ? teamTasksData.data.tasks : [];
  const firstTeamGroups =
    teamTasksData?.data && 'groups' in teamTasksData.data ? (teamTasksData.data.groups ?? []) : [];
  const teamQueryHash =
    teamTasksData?.data && 'queryHash' in teamTasksData.data
      ? teamTasksData.data.queryHash
      : undefined;
  const [teamTail, setTeamTail] = useState<typeof firstTeamTasks>([]);
  const [teamGroupTail, setTeamGroupTail] = useState<typeof firstTeamGroups>([]);
  useEffect(() => {
    setTeamTail([]);
    setTeamGroupTail([]);
  }, [cycleId, layout, noProject, teamId, teamQueryHash, workspaceId]);
  const teamTasks = mergeWorkQueryPage(firstTeamTasks, teamTail);
  const teamGroups = mergeWorkQueryGroups(firstTeamGroups, teamGroupTail);
  const tasks = triageData?.data && 'tasks' in triageData.data ? triageData.data.tasks : [];
  const destinations = otherTeamOptions(teamsData?.data ?? [], teamId ?? '');
  const triageState = teamSurfaceState({
    error: triageError,
    isLoading,
    itemCount: tasks.length,
  });
  const workState = teamSurfaceState({
    error: teamTasksError,
    isLoading: isTeamTasksLoading,
    itemCount: teamTasks.length + teamGroups.reduce((sum, group) => sum + group.tasks.length, 0),
  });

  const act = useCallback(
    async (
      task: TeamTriageTask,
      action: 'accept' | 'decline' | 'duplicate' | 'reassign',
      extra?: { assigneeUserId?: string; canonicalTaskId?: string },
    ) => {
      if (task.domainRevision === undefined) return;
      try {
        await workAttentionService.triage({
          action,
          expectedDomainRevision: task.domainRevision,
          taskId: task.id,
          teamId: teamId!,
          ...(extra?.assigneeUserId ? { assigneeUserId: extra.assigneeUserId } : {}),
          ...(extra?.canonicalTaskId ? { canonicalTaskId: extra.canonicalTaskId } : {}),
        });
        await Promise.all([
          mutate(['team-triage', workspaceId, teamId, cycleId, noProject]),
          mutate(['team-tasks', workspaceId, teamId, cycleId, noProject, layout]),
        ]);
        toast.success(t('teams.triageUpdated'));
      } catch (error) {
        toast.error(
          isTrpcErrorCode(error, 'CONFLICT')
            ? t('teams.transferConflict')
            : t('teams.triageFailed'),
        );
      }
    },
    [cycleId, layout, noProject, t, teamId, workspaceId],
  );

  const refreshTriage = useCallback(() => {
    setTeamTail([]);
    setTeamGroupTail([]);
    void Promise.all([
      mutate(['team-triage', workspaceId, teamId, cycleId, noProject]),
      mutate(['team-tasks', workspaceId, teamId, cycleId, noProject, layout]),
    ]);
  }, [cycleId, layout, noProject, teamId, workspaceId]);

  const loadMoreTeam = useCallback(async () => {
    const last = teamTasks.at(-1);
    if (!last || !teamId || !teamQueryHash) return;
    const next = await workAttentionService.query({
      afterId: last.id,
      query: teamTaskQuery(teamId, cycleId, noProject, 'list'),
      queryHash: teamQueryHash,
    });
    const incoming = next.data && 'tasks' in next.data ? next.data.tasks : [];
    setTeamTail((current) => mergeWorkQueryPage(current, incoming));
  }, [cycleId, noProject, teamId, teamQueryHash, teamTasks]);

  const loadMoreTeamGroup = useCallback(
    async (groupKey: string) => {
      const column = teamGroups.find((group) => group.key === groupKey);
      const last = column?.tasks.at(-1);
      if (!last || !teamId || !teamQueryHash) return;
      const next = await workAttentionService.query({
        afterId: last.id,
        groupKey,
        query: teamTaskQuery(teamId, cycleId, noProject, layout),
        queryHash: teamQueryHash,
      });
      const incoming = next.data && 'groups' in next.data ? (next.data.groups ?? []) : [];
      setTeamGroupTail((current) => mergeWorkQueryGroups(current, incoming));
    },
    [cycleId, layout, noProject, teamGroups, teamId, teamQueryHash],
  );

  const cycleOptions = useMemo(
    () => [
      { label: t('teams.cycleAll'), value: ALL_TEAM_CYCLES },
      ...(teamData?.data.cycles ?? []).map((cycle) => ({
        label: cycle.name || cycle.id,
        value: cycle.id,
      })),
    ],
    [t, teamData?.data.cycles],
  );

  return (
    <Flexbox flex={1} height="100%">
      <NavHeader
        right={<WorkFavoriteButton targetId={teamId} targetType="team" />}
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {teamData?.data.team.name ?? t('tab.teams')}
          </Text>
        }
      />
      {!workspaceId ? (
        <Center flex={1}>
          <Empty description={t('teams.personal')} icon={UsersIcon} />
        </Center>
      ) : teamError ? (
        <WideScreenContainer
          gap={16}
          paddingBlock={16}
          wrapperStyle={{ flex: 1, overflowY: 'auto' }}
        >
          <AsyncError error={teamError} onRetry={() => revalidateTeam()} />
        </WideScreenContainer>
      ) : (
        <WideScreenContainer
          gap={16}
          paddingBlock={16}
          wrapperStyle={{ flex: 1, overflowY: 'auto' }}
        >
          {teamTab === 'home' || teamTab === 'triage' || teamTab === 'issues' ? (
            <Flexbox horizontal align="center" gap={12} justify="space-between" wrap="wrap">
              <Flexbox horizontal gap={8} wrap="wrap">
                {cycleOptions.length > 1 ? (
                  <Select
                    aria-label={t('teams.cycle')}
                    options={cycleOptions}
                    size="small"
                    style={{ maxWidth: 280 }}
                    value={cycleId}
                    onChange={(next) => {
                      if (typeof next === 'string') setCycleId(next);
                    }}
                  />
                ) : null}
                <Button
                  icon={FolderXIcon}
                  size="small"
                  type={noProject ? 'primary' : 'default'}
                  onClick={() => setNoProject((current) => !current)}
                >
                  {t('teams.noProject')}
                </Button>
              </Flexbox>
              <Segmented
                size="small"
                value={layout}
                options={[
                  { label: t('teams.layoutList'), value: 'list' },
                  { label: t('teams.layoutBoard'), value: 'board' },
                ]}
                onChange={(value) => setLayout(value as WorkQueryLayout)}
              />
            </Flexbox>
          ) : null}
          {wantsTriage ? (
            <>
              <Text weight={500}>{t('teams.triage')}</Text>
              {triageState === 'error' ? (
                <AsyncError error={triageError} onRetry={() => revalidateTriage()} />
              ) : triageState === 'loading' ? (
                <SkeletonList aria-label={t('teams.loading')} rows={4} />
              ) : triageState === 'empty' ? (
                <Center flex={1} padding={48}>
                  <Empty description={t('teams.triageEmpty')} icon={ListChecksIcon} />
                </Center>
              ) : (
                <Flexbox gap={2}>
                  {tasks.map((task) => (
                    <TeamTriageRow
                      canonicals={duplicateCanonicalOptions(teamTasks, task.id)}
                      destinations={destinations}
                      key={task.id}
                      members={teamData?.data.members ?? []}
                      task={task}
                      onAccept={() => void act(task, 'accept')}
                      onDecline={() => void act(task, 'decline')}
                      onTransferred={refreshTriage}
                      onDuplicate={(_id, canonicalTaskId) =>
                        void act(task, 'duplicate', { canonicalTaskId })
                      }
                      onReassign={(_id, assigneeUserId) =>
                        void act(task, 'reassign', { assigneeUserId })
                      }
                    />
                  ))}
                </Flexbox>
              )}
            </>
          ) : null}
          {wantsTasks ? <Text weight={500}>{t('teams.work')}</Text> : null}
          {teamTab === 'projects' ? (
            isTeamProjectsLoading ? (
              <SkeletonList aria-label={t('teams.loading')} rows={4} />
            ) : teamProjectsError && teamProjects.length === 0 ? (
              <AsyncError error={teamProjectsError} onRetry={() => revalidateTeamProjects()} />
            ) : teamProjects.length === 0 ? (
              <Center flex={1} padding={48}>
                <Empty description={t('teams.projectsEmpty')} icon={FolderXIcon} />
              </Center>
            ) : (
              <Flexbox gap={2}>
                {teamProjectsError ? (
                  <AsyncError
                    error={teamProjectsError}
                    variant={'inline'}
                    onRetry={() => revalidateTeamProjects()}
                  />
                ) : null}
                {teamProjects.map((project) => (
                  <SavedViewProjectRow key={project.id} project={project} />
                ))}
              </Flexbox>
            )
          ) : null}
          {teamTab === 'views' ? (
            isTeamViewsLoading ? (
              <SkeletonList aria-label={t('teams.loading')} rows={4} />
            ) : teamViewsError && teamViews.length === 0 ? (
              <AsyncError error={teamViewsError} onRetry={() => revalidateTeamViews()} />
            ) : teamViews.length === 0 ? (
              <Center flex={1} padding={48}>
                <Empty description={t('teams.viewsEmpty')} icon={ListChecksIcon} />
              </Center>
            ) : (
              <Flexbox gap={2}>
                {teamViewsError ? (
                  <AsyncError
                    error={teamViewsError}
                    variant={'inline'}
                    onRetry={() => revalidateTeamViews()}
                  />
                ) : null}
                {teamViews.map((view) => (
                  <WorkspaceLink className={styles.link} key={view.id} to={`/views/${view.id}`}>
                    <Flexbox horizontal align="center" className={styles.row} gap={8}>
                      <Flexbox flex={1} style={{ minWidth: 0 }}>
                        <Text ellipsis weight={500}>
                          {view.name}
                        </Text>
                      </Flexbox>
                      <Text fontSize={12} type={'secondary'}>
                        {view.layout}
                      </Text>
                    </Flexbox>
                  </WorkspaceLink>
                ))}
              </Flexbox>
            )
          ) : null}
          {wantsTasks ? (
            workState === 'error' ? (
              <AsyncError error={teamTasksError} onRetry={() => revalidateTeamTasks()} />
            ) : (
              <WorkQueryResults
                emptyLabel={t('teams.workEmpty')}
                groups={teamGroups}
                layout={layout}
                loadMoreLabel={t('myWork.loadMore')}
                loading={workState === 'loading'}
                loadingLabel={t('teams.loading')}
                movable={layout === 'board'}
                tasks={teamTasks}
                groupBy={
                  teamTasksData?.data && 'groupBy' in teamTasksData.data
                    ? teamTasksData.data.groupBy
                    : undefined
                }
                total={
                  teamTasksData?.data && 'total' in teamTasksData.data
                    ? teamTasksData.data.total
                    : undefined
                }
                onLoadMore={layout === 'list' ? () => void loadMoreTeam() : undefined}
                onLoadMoreGroup={(key) => void loadMoreTeamGroup(key)}
                onMoved={refreshTriage}
              />
            )
          ) : null}
        </WideScreenContainer>
      )}
    </Flexbox>
  );
});

TeamPage.displayName = 'TeamPage';

export default TeamPage;
