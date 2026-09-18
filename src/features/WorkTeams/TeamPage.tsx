'use client';

import { Empty, Flexbox } from '@lobehub/ui';
import { Button, Select, Text, toast } from '@lobehub/ui/base-ui';
import type { WorkQueryLayout } from '@orvilo/types';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import { mergeWorkQueryGroups, mergeWorkQueryPage } from '@/features/MyWork/workQueryPaging';
import WorkQueryResults from '@/features/MyWork/WorkQueryResults';
import NavHeader from '@/features/NavHeader';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { lambdaClient } from '@/libs/trpc/client';
import { workAttentionService } from '@/services/workAttention';
import { isTrpcErrorCode } from '@/utils/trpcError';

import { duplicateCanonicalOptions } from './duplicateCanonicalOptions';
import { otherTeamOptions } from './otherTeamOptions';
import { reassignMemberOptions } from './reassignMemberOptions';
import { ALL_TEAM_CYCLES, teamTaskQuery, teamTriageQuery } from './teamWorkQuery';

type TeamTriageTask = {
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  domainRevision?: number;
  id: string;
  identifier?: string | null;
  instruction?: string | null;
  name?: string | null;
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
    const [destination, setDestination] = useState<string | undefined>();
    const [assigneeUserId, setAssigneeUserId] = useState<string | undefined>();
    const [canonicalTaskId, setCanonicalTaskId] = useState<string | undefined>();
    const selected = destination ?? destinations[0]?.value;
    const memberOptions = reassignMemberOptions(members, task.assigneeUserId);
    const selectedAssignee = assigneeUserId ?? memberOptions[0]?.value;
    const selectedCanonical = canonicalTaskId ?? canonicals[0]?.value;

    const transfer = useCallback(async () => {
      if (!selected || task.domainRevision === undefined) return;
      try {
        await lambdaClient.team.moveTaskToTeam.mutate({
          expectedDomainRevision: task.domainRevision,
          taskId: task.id,
          teamId: selected,
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
    }, [onTransferred, selected, t, task.domainRevision, task.id]);

    return (
      <Flexbox horizontal align="center" gap={8} wrap="wrap">
        <WorkspaceLink to={taskDetailPath(task.id, task.assigneeAgentId ?? undefined, task.name)}>
          <Text weight={500}>{task.name ?? task.instruction}</Text>
        </WorkspaceLink>
        <Button size="small" type="primary" onClick={() => onAccept(task.id)}>
          {t('teams.accept')}
        </Button>
        <Button size="small" onClick={() => onDecline(task.id)}>
          {t('teams.decline')}
        </Button>
        {canonicals.length > 0 ? (
          <>
            <Select
              aria-label={t('teams.canonical')}
              options={canonicals}
              placeholder={t('teams.canonical')}
              size="small"
              style={{ minWidth: 160 }}
              value={selectedCanonical}
              onChange={(next) => {
                if (typeof next === 'string') setCanonicalTaskId(next);
              }}
            />
            <Button
              size="small"
              onClick={() => {
                if (selectedCanonical) onDuplicate(task.id, selectedCanonical);
              }}
            >
              {t('teams.markDuplicate')}
            </Button>
          </>
        ) : null}
        {destinations.length > 0 ? (
          <>
            <Select
              aria-label={t('teams.transferTo')}
              options={destinations}
              placeholder={t('teams.transferTo')}
              size="small"
              style={{ minWidth: 140 }}
              value={selected}
              onChange={(next) => {
                if (typeof next === 'string') setDestination(next);
              }}
            />
            <Button size="small" onClick={() => void transfer()}>
              {t('teams.transfer')}
            </Button>
          </>
        ) : null}
        {memberOptions.length > 0 ? (
          <>
            <Select
              aria-label={t('teams.reassignTo')}
              options={memberOptions}
              placeholder={t('teams.reassignTo')}
              size="small"
              style={{ minWidth: 140 }}
              value={selectedAssignee}
              onChange={(next) => {
                if (typeof next === 'string') setAssigneeUserId(next);
              }}
            />
            <Button
              size="small"
              onClick={() => {
                if (selectedAssignee) onReassign(task.id, selectedAssignee);
              }}
            >
              {t('teams.reassign')}
            </Button>
          </>
        ) : null}
      </Flexbox>
    );
  },
);

TeamTriageRow.displayName = 'TeamTriageRow';

const TeamPage = memo(() => {
  const { t } = useTranslation('common');
  const { teamId } = useParams<{ teamId: string }>();
  const workspaceId = useActiveWorkspaceId();
  const [cycleId, setCycleId] = useState(ALL_TEAM_CYCLES);
  const [noProject, setNoProject] = useState(false);
  const [layout, setLayout] = useState<WorkQueryLayout>('list');
  const { data: teamData } = useClientDataSWR(
    teamId && workspaceId ? ['team', workspaceId, teamId] : null,
    () => lambdaClient.team.team.query({ teamId: teamId! }),
  );
  const { data: teamsData } = useClientDataSWR(
    workspaceId ? workAttentionKeys.teams(workspaceId) : null,
    () => lambdaClient.team.teams.query(),
  );
  const { data: triageData, isLoading } = useClientDataSWR(
    teamId && workspaceId ? ['team-triage', workspaceId, teamId, cycleId, noProject] : null,
    () =>
      workAttentionService.query({
        query: teamTriageQuery(teamId!, cycleId, noProject),
      }),
  );
  const { data: teamTasksData, isLoading: isTeamTasksLoading } = useClientDataSWR(
    teamId && workspaceId ? ['team-tasks', workspaceId, teamId, cycleId, noProject, layout] : null,
    () =>
      workAttentionService.query({
        query: teamTaskQuery(teamId!, cycleId, noProject, layout),
      }),
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
        query: teamTaskQuery(teamId, cycleId, noProject, 'board'),
        queryHash: teamQueryHash,
      });
      const incoming = next.data && 'groups' in next.data ? (next.data.groups ?? []) : [];
      setTeamGroupTail((current) => mergeWorkQueryGroups(current, incoming));
    },
    [cycleId, noProject, teamGroups, teamId, teamQueryHash],
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
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {teamData?.data.team.name ?? t('tab.teams')}
          </Text>
        }
        right={
          <Button
            size="small"
            onClick={() => setLayout((current) => (current === 'board' ? 'list' : 'board'))}
          >
            {layout === 'board' ? t('teams.layoutList') : t('teams.layoutBoard')}
          </Button>
        }
      />
      <Flexbox gap={12} padding={16} style={{ overflow: 'auto' }}>
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
            size="small"
            type={noProject ? 'primary' : undefined}
            onClick={() => setNoProject((current) => !current)}
          >
            {t('teams.noProject')}
          </Button>
        </Flexbox>
        <Text weight={500}>{t('teams.triage')}</Text>
        {isLoading ? (
          <Text type="secondary">{t('teams.loading')}</Text>
        ) : tasks.length === 0 ? (
          <Empty description={t('teams.triageEmpty')} />
        ) : (
          tasks.map((task) => (
            <TeamTriageRow
              canonicals={duplicateCanonicalOptions(teamTasks, task.id)}
              destinations={destinations}
              key={task.id}
              members={teamData?.data.members ?? []}
              task={task}
              onAccept={() => void act(task, 'accept')}
              onDecline={() => void act(task, 'decline')}
              onReassign={(_id, assigneeUserId) => void act(task, 'reassign', { assigneeUserId })}
              onTransferred={refreshTriage}
              onDuplicate={(_id, canonicalTaskId) =>
                void act(task, 'duplicate', { canonicalTaskId })
              }
            />
          ))
        )}
        <Text weight={500}>{t('teams.work')}</Text>
        <WorkQueryResults
          emptyLabel={t('teams.workEmpty')}
          groups={teamGroups}
          layout={layout}
          loadMoreLabel={t('myWork.loadMore')}
          loading={isTeamTasksLoading}
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
          onLoadMoreGroup={layout === 'board' ? (key) => void loadMoreTeamGroup(key) : undefined}
          onMoved={refreshTriage}
        />
      </Flexbox>
    </Flexbox>
  );
});

TeamPage.displayName = 'TeamPage';

export default TeamPage;
