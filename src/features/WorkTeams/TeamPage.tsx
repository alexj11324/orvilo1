'use client';

import { Empty, Flexbox } from '@lobehub/ui';
import { Button, Select, Text, toast } from '@lobehub/ui/base-ui';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
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
  const { data: teamData } = useClientDataSWR(
    teamId && workspaceId ? ['team', workspaceId, teamId] : null,
    () => lambdaClient.team.team.query({ teamId: teamId! }),
  );
  const { data: teamsData } = useClientDataSWR(
    workspaceId ? workAttentionKeys.teams(workspaceId) : null,
    () => lambdaClient.team.teams.query(),
  );
  const { data: triageData, isLoading } = useClientDataSWR(
    teamId && workspaceId ? ['team-triage', workspaceId, teamId] : null,
    () =>
      workAttentionService.query({
        query: {
          entityType: 'task',
          filter: {
            all: [
              { field: 'teamId', op: 'eq', value: teamId },
              { field: 'triageStatus', op: 'eq', value: 'untriaged' },
            ],
          },
          schemaVersion: 1,
        },
      }),
  );
  const { data: teamTasksData } = useClientDataSWR(
    teamId && workspaceId ? ['team-tasks', workspaceId, teamId] : null,
    () =>
      workAttentionService.query({
        query: {
          entityType: 'task',
          filter: { all: [{ field: 'teamId', op: 'eq', value: teamId }] },
          schemaVersion: 1,
        },
      }),
  );
  const tasks = triageData?.data && 'tasks' in triageData.data ? triageData.data.tasks : [];
  const teamTasks =
    teamTasksData?.data && 'tasks' in teamTasksData.data ? teamTasksData.data.tasks : [];
  const destinations = otherTeamOptions(teamsData?.data ?? [], teamId ?? '');

  const act = useCallback(
    async (
      taskId: string,
      action: 'accept' | 'decline' | 'duplicate' | 'reassign',
      extra?: { assigneeUserId?: string; canonicalTaskId?: string },
    ) => {
      try {
        await workAttentionService.triage({
          action,
          taskId,
          teamId: teamId!,
          ...(extra?.assigneeUserId ? { assigneeUserId: extra.assigneeUserId } : {}),
          ...(extra?.canonicalTaskId ? { canonicalTaskId: extra.canonicalTaskId } : {}),
        });
        await Promise.all([
          mutate(['team-triage', workspaceId, teamId]),
          mutate(['team-tasks', workspaceId, teamId]),
        ]);
        toast.success(t('teams.triageUpdated'));
      } catch {
        toast.error(t('teams.triageFailed'));
      }
    },
    [t, teamId, workspaceId],
  );

  const refreshTriage = useCallback(() => {
    void Promise.all([
      mutate(['team-triage', workspaceId, teamId]),
      mutate(['team-tasks', workspaceId, teamId]),
    ]);
  }, [teamId, workspaceId]);

  return (
    <Flexbox flex={1} height="100%">
      <NavHeader
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {teamData?.data.team.name ?? t('tab.teams')}
          </Text>
        }
      />
      <Flexbox gap={12} padding={16} style={{ overflow: 'auto' }}>
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
              onAccept={(id) => void act(id, 'accept')}
              onDecline={(id) => void act(id, 'decline')}
              onDuplicate={(id, canonicalTaskId) => void act(id, 'duplicate', { canonicalTaskId })}
              onReassign={(id, assigneeUserId) => void act(id, 'reassign', { assigneeUserId })}
              onTransferred={refreshTriage}
            />
          ))
        )}
      </Flexbox>
    </Flexbox>
  );
});

TeamPage.displayName = 'TeamPage';

export default TeamPage;
