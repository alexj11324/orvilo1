'use client';
import { WORK_SEARCH_MAX_PER_TYPE } from '@orvilo/types';
import { useDebounce } from 'ahooks';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import dayjs from 'dayjs';
import { SearchIcon, SearchXIcon, UsersIcon, XIcon } from 'lucide-react';
import { createElement, memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import NavHeader from '@/features/NavHeader';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { WorkSurface, WorkSurfaceCollection, WorkSurfaceToolbar } from '@/features/WorkSurface';
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
  <div className={cn('flex flex-row items-center', styles.row)}>
    <WorkspaceLink className={styles.link} to={`/teams/${team.id}`}>
      <TeamIdentity
        color={team.color}
        id={team.id}
        letter={(team.key || team.name).slice(0, 1)}
        size={18}
      />
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-sm truncate font-medium">{team.name}</span>
      </div>
      {team.key ? <span className={styles.key}>{team.key}</span> : null}
      {team.updatedAt ? (
        <span
          className={cn('text-sm', styles.meta)}
          title={dayjs(team.updatedAt).format('YYYY-MM-DD HH:mm')}
        >
          {dayjs(team.updatedAt).fromNow()}
        </span>
      ) : null}
    </WorkspaceLink>
  </div>
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
    <WorkSurface>
      <NavHeader
        left={
          <span className="text-sm font-medium" style={{ paddingInlineStart: 4 }}>
            {t('tab.teams')}
          </span>
        }
      />
      {!workspaceId ? (
        <div className="flex flex-col items-center justify-center flex-1">
          <div className="flex flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
            <UsersIcon aria-hidden className="size-8" />
            <p>{t('teams.personal')}</p>
          </div>
        </div>
      ) : (
        <WorkSurfaceCollection
          toolbar={
            <WorkSurfaceToolbar>
              <InputGroup className="max-w-70">
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label={t('teams.searchPlaceholder')}
                  placeholder={t('teams.searchPlaceholder')}
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
                {keyword ? (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton aria-label={t('close')} onClick={() => setKeyword('')}>
                      <XIcon />
                    </InputGroupButton>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
            </WorkSurfaceToolbar>
          }
        >
          {error ? (
            <AsyncError error={error} onRetry={() => revalidate()} />
          ) : isLoading ? (
            <div aria-busy className="flex flex-col gap-2">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton className="h-10 w-full" key={index} />
              ))}
            </div>
          ) : teams.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 p-12">
              <div className="flex flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                {createElement(searching ? SearchXIcon : UsersIcon, {
                  'aria-hidden': true,
                  'className': 'size-8',
                })}
                <p>{searching ? t('teams.searchEmpty') : t('teams.empty')}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col" style={{ gap: 2 }}>
              {teams.map((team) => (
                <TeamRow key={team.id} team={team} />
              ))}
            </div>
          )}
        </WorkSurfaceCollection>
      )}
    </WorkSurface>
  );
});

TeamsPage.displayName = 'TeamsPage';

export default TeamsPage;
