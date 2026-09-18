'use client';

import { Empty, Flexbox } from '@lobehub/ui';
import { Button, Text, toast } from '@lobehub/ui/base-ui';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import NavHeader from '@/features/NavHeader';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { lambdaClient } from '@/libs/trpc/client';
import { workAttentionService } from '@/services/workAttention';

const TeamPage = memo(() => {
  const { t } = useTranslation('common');
  const { teamId } = useParams<{ teamId: string }>();
  const workspaceId = useActiveWorkspaceId();
  const { data: teamData } = useClientDataSWR(
    teamId && workspaceId ? ['team', workspaceId, teamId] : null,
    () => lambdaClient.team.team.query({ teamId: teamId! }),
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
  const tasks = triageData?.data && 'tasks' in triageData.data ? triageData.data.tasks : [];

  const act = useCallback(
    async (taskId: string, action: 'accept' | 'decline') => {
      try {
        await workAttentionService.triage({ action, taskId, teamId: teamId! });
        await mutate(['team-triage', workspaceId, teamId]);
        toast.success(t('teams.triageUpdated'));
      } catch {
        toast.error(t('teams.triageFailed'));
      }
    },
    [t, teamId, workspaceId],
  );

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
            <Flexbox horizontal align="center" gap={8} key={task.id}>
              <WorkspaceLink to={taskDetailPath(task.id, task.assigneeAgentId, task.name)}>
                <Text weight={500}>{task.name ?? task.instruction}</Text>
              </WorkspaceLink>
              <Button size="small" type="primary" onClick={() => void act(task.id, 'accept')}>
                {t('teams.accept')}
              </Button>
              <Button size="small" onClick={() => void act(task.id, 'decline')}>
                {t('teams.decline')}
              </Button>
            </Flexbox>
          ))
        )}
      </Flexbox>
    </Flexbox>
  );
});

TeamPage.displayName = 'TeamPage';

export default TeamPage;
