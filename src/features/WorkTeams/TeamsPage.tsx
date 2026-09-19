'use client';

import { Center, Empty, Flexbox, SearchBar } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { WORK_SEARCH_MAX_PER_TYPE } from '@orvilo/types';
import { useDebounce } from 'ahooks';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { SearchXIcon, UsersIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import NavHeader from '@/features/NavHeader';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import WideScreenContainer from '@/features/WideScreenContainer';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { lambdaClient } from '@/libs/trpc/client';
import { workAttentionService } from '@/services/workAttention';

import TeamIdentity from './TeamIdentity';

const styles = createStaticStyles(({ css }) => ({
  key: css`
    flex: none;

    min-width: 56px;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
    text-align: end;
    white-space: nowrap;
  `,
  link: css`
    display: flex;
    flex: 1;
    gap: 12px;
    align-items: center;

    min-width: 0;

    color: inherit;
  `,
  meta: css`
    flex: none;
    color: ${cssVar.colorTextQuaternary};
    white-space: nowrap;
  `,
  row: css`
    padding-block: 8px;
    padding-inline: 8px 12px;
    border-radius: ${cssVar.borderRadiusLG};

    color: inherit;

    transition: background ${cssVar.motionDurationFast};

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

interface TeamRowData {
  color?: string | null;
  id: string;
  key?: string;
  name: string;
  updatedAt?: Date | string | null;
}

const TeamRow = memo<{ team: TeamRowData }>(({ team }) => (
  <Flexbox horizontal align={'center'} className={styles.row}>
    <WorkspaceLink className={styles.link} to={`/teams/${team.id}`}>
      <TeamIdentity
        color={team.color}
        id={team.id}
        letter={(team.key || team.name).slice(0, 1)}
        size={18}
      />
      <Flexbox flex={1} style={{ minWidth: 0 }}>
        <Text ellipsis weight={500}>
          {team.name}
        </Text>
      </Flexbox>
      {team.key ? <span className={styles.key}>{team.key}</span> : null}
      {team.updatedAt ? (
        <Text
          className={styles.meta}
          fontSize={12}
          title={dayjs(team.updatedAt).format('YYYY-MM-DD HH:mm')}
        >
          {dayjs(team.updatedAt).fromNow()}
        </Text>
      ) : null}
    </WorkspaceLink>
  </Flexbox>
));

TeamRow.displayName = 'TeamRow';

const TeamsPage = memo(() => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const [keyword, setKeyword] = useState('');
  const needle = keyword.trim();
  const debounced = useDebounce(needle, { wait: 300 });
  const searching = needle.length > 0;
  const queryReady = searching && debounced === needle;

  const {
    data: listData,
    error: listError,
    isLoading: listLoading,
    mutate: revalidateList,
  } = useClientDataSWR(
    workspaceId && !searching ? workAttentionKeys.teams(workspaceId) : null,
    () => lambdaClient.team.teams.query(),
  );
  const {
    data: searchData,
    error: searchError,
    isLoading: searchLoading,
    mutate: revalidateSearch,
  } = useClientDataSWR(
    workspaceId && queryReady ? workAttentionKeys.search(workspaceId, debounced, 'team') : null,
    () =>
      workAttentionService.search({
        limitPerType: WORK_SEARCH_MAX_PER_TYPE,
        query: debounced,
        type: 'team',
      }),
  );

  const teams: TeamRowData[] = searching
    ? (searchData?.data ?? []).map((row) => ({
        id: row.id,
        key: row.description ?? undefined,
        name: row.title,
        updatedAt: row.updatedAt,
      }))
    : (listData?.data ?? []).map((team) => ({
        id: team.id,
        key: team.key,
        name: team.name,
        updatedAt: team.updatedAt,
      }));
  const isLoading = searching ? !queryReady || searchLoading : listLoading;
  const error = searching ? searchError : listError;
  const revalidate = searching ? revalidateSearch : revalidateList;

  return (
    <Flexbox flex={1} height="100%">
      <NavHeader
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {t('tab.teams')}
          </Text>
        }
      />
      {!workspaceId ? (
        <Center flex={1}>
          <Empty description={t('teams.personal')} icon={UsersIcon} />
        </Center>
      ) : (
        <WideScreenContainer
          gap={16}
          paddingBlock={16}
          wrapperStyle={{ flex: 1, overflowY: 'auto' }}
        >
          <SearchBar
            allowClear
            placeholder={t('teams.searchPlaceholder')}
            style={{ maxWidth: 280 }}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          {error ? (
            <AsyncError error={error} onRetry={() => revalidate()} />
          ) : isLoading ? (
            <SkeletonList rows={8} />
          ) : teams.length === 0 ? (
            <Center flex={1} padding={48}>
              <Empty
                description={searching ? t('teams.searchEmpty') : t('teams.empty')}
                icon={searching ? SearchXIcon : UsersIcon}
              />
            </Center>
          ) : (
            <Flexbox gap={2}>
              {teams.map((team) => (
                <TeamRow key={team.id} team={team} />
              ))}
            </Flexbox>
          )}
        </WideScreenContainer>
      )}
    </Flexbox>
  );
});

TeamsPage.displayName = 'TeamsPage';

export default TeamsPage;
