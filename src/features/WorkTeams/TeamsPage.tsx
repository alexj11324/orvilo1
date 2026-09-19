'use client';

import { Empty, Flexbox, SearchBar } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { WORK_SEARCH_MAX_PER_TYPE } from '@orvilo/types';
import { useDebounce } from 'ahooks';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import NavHeader from '@/features/NavHeader';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { lambdaClient } from '@/libs/trpc/client';
import { workAttentionService } from '@/services/workAttention';

const TeamsPage = memo(() => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const [keyword, setKeyword] = useState('');
  const needle = keyword.trim();
  const debounced = useDebounce(needle, { wait: 300 });
  const searching = needle.length > 0;
  const queryReady = searching && debounced === needle;

  const { data: listData, isLoading: listLoading } = useClientDataSWR(
    workspaceId && !searching ? workAttentionKeys.teams(workspaceId) : null,
    () => lambdaClient.team.teams.query(),
  );
  const { data: searchData, isLoading: searchLoading } = useClientDataSWR(
    workspaceId && queryReady ? workAttentionKeys.search(workspaceId, debounced, 'team') : null,
    () =>
      workAttentionService.search({
        limitPerType: WORK_SEARCH_MAX_PER_TYPE,
        query: debounced,
        type: 'team',
      }),
  );

  const teams = searching
    ? (searchData?.data ?? []).map((row) => ({
        id: row.id,
        key: row.description ?? undefined,
        name: row.title,
      }))
    : (listData?.data ?? []).map((team) => ({
        id: team.id,
        key: team.key,
        name: team.name,
      }));
  const isLoading = searching ? !queryReady || searchLoading : listLoading;

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
        ) : (
          <>
            <SearchBar
              allowClear
              placeholder={t('teams.searchPlaceholder')}
              style={{ maxWidth: 280 }}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            {isLoading ? (
              <Text type="secondary">{t('teams.loading')}</Text>
            ) : teams.length === 0 ? (
              <Empty description={searching ? t('teams.searchEmpty') : t('teams.empty')} />
            ) : (
              teams.map((team) => (
                <WorkspaceLink key={team.id} to={`/teams/${team.id}`}>
                  <Text weight={500}>{team.name}</Text>
                </WorkspaceLink>
              ))
            )}
          </>
        )}
      </Flexbox>
    </Flexbox>
  );
});

TeamsPage.displayName = 'TeamsPage';

export default TeamsPage;
