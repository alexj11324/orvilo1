'use client';
import { WORK_SEARCH_MAX_PER_TYPE } from '@orvilo/types';
import { formatAbsoluteDateTime } from '@orvilo/utils/time';
import { useDebounce } from 'ahooks';
import { cn } from 'cn';
import dayjs from 'dayjs';
import { SearchIcon, SearchXIcon, UsersIcon, XIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import SimpleEmpty from '@/components/SimpleEmpty';
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

interface TeamRowData {
  color?: string | null;
  id: string;
  key?: string;
  name: string;
  updatedAt?: Date | string | null;
}

const TeamRow = memo<{ team: TeamRowData }>(({ team }) => (
  <div
    className={cn(
      'flex flex-row items-center',
      'py-2 ps-2 pe-3 rounded-(--radius-card) text-inherit transition-[background-color] duration-(--orvilo-motion-fast) ease-[ease] hover:bg-accent',
    )}
  >
    <WorkspaceLink
      className="flex flex-1 items-center gap-3 min-w-0 text-inherit"
      to={`/teams/${team.id}`}
    >
      <TeamIdentity
        color={team.color}
        id={team.id}
        letter={(team.key || team.name).slice(0, 1)}
        size={18}
      />
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-sm truncate font-medium">{team.name}</span>
      </div>
      {team.key ? (
        <span className="flex-none min-w-14 font-mono text-xs leading-5 text-foreground-tertiary text-end whitespace-nowrap">
          {team.key}
        </span>
      ) : null}
      {team.updatedAt ? (
        <span
          title={formatAbsoluteDateTime(team.updatedAt)}
          className={cn(
            'text-sm',
            'flex-none text-xs leading-5 text-foreground-tertiary whitespace-nowrap',
          )}
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
      <NavHeader left={<span className="text-sm font-medium ps-1">{t('tab.teams')}</span>} />
      {!workspaceId ? (
        <SimpleEmpty description={t('teams.personal')} icon={UsersIcon} />
      ) : (
        <WorkSurfaceCollection
          toolbar={
            <WorkSurfaceToolbar>
              <InputGroup className="max-w-70 rounded-(--radius-input)" visualSize="compact">
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
                    <InputGroupButton
                      aria-label={t('close')}
                      className="rounded-(--radius-button)"
                      size="icon-sm"
                      onClick={() => setKeyword('')}
                    >
                      <XIcon className="size-4" />
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
            <div aria-busy className="flex flex-col gap-0.5">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton className="h-9 w-full" key={index} />
              ))}
            </div>
          ) : teams.length === 0 ? (
            <SimpleEmpty
              description={searching ? t('teams.searchEmpty') : t('teams.empty')}
              icon={searching ? SearchXIcon : UsersIcon}
            />
          ) : (
            <div className="flex flex-col gap-0.5">
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
