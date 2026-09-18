'use client';

import { Empty, Flexbox } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import NavHeader from '@/features/NavHeader';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { lambdaClient } from '@/libs/trpc/client';

const TeamsPage = memo(() => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const { data, isLoading } = useClientDataSWR(
    workspaceId ? workAttentionKeys.teams(workspaceId) : null,
    () => lambdaClient.team.teams.query(),
  );
  const teams = data?.data ?? [];

  return (
    <Flexbox flex={1} height="100%">
      <NavHeader
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {t('tab.teams')}
          </Text>
        }
      />
      <Flexbox gap={8} padding={16} style={{ overflow: 'auto' }}>
        {!workspaceId ? (
          <Empty description={t('teams.personal')} />
        ) : isLoading ? (
          <Text type="secondary">{t('teams.loading')}</Text>
        ) : teams.length === 0 ? (
          <Empty description={t('teams.empty')} />
        ) : (
          teams.map((team) => (
            <WorkspaceLink key={team.id} to={`/teams/${team.id}`}>
              <Text weight={500}>{team.name}</Text>
            </WorkspaceLink>
          ))
        )}
      </Flexbox>
    </Flexbox>
  );
});

TeamsPage.displayName = 'TeamsPage';

export default TeamsPage;
