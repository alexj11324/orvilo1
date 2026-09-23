'use client';

import { Center, Empty, Flexbox } from '@lobehub/ui';
import { Button, Segmented, Select, Text } from '@lobehub/ui/base-ui';
import type { WorkQueryLayout } from '@orvilo/types';
import { FolderXIcon, ListChecksIcon, UsersIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import AsyncError from '@/components/AsyncError';
import WorkFavoriteButton from '@/features/HomeSidebar/Body/WorkFavoriteButton';
import { mergeWorkQueryGroups, mergeWorkQueryPage } from '@/features/MyWork/workQueryPaging';
import WorkQueryResults from '@/features/MyWork/WorkQueryResults';
import NavHeader from '@/features/NavHeader';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { SavedViewProjectRow } from '@/features/SavedViews/SavedViewPage';
import { WorkSurface, WorkSurfaceCollection, WorkSurfaceToolbar } from '@/features/WorkSurface';
import { useSearchParams } from '@/libs/router/navigation';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { lambdaClient } from '@/libs/trpc/client';
import { workAttentionService } from '@/services/workAttention';

import { otherTeamOptions } from './otherTeamOptions';
import TeamHome from './TeamHome';
import TeamIdentity from './TeamIdentity';
import { nextTeamIssueScopeNavigation } from './teamIssueScopeNavigation';
import TeamProjectsSurface from './TeamProjectsSurface';
import { teamSurfaceState } from './teamSurfaceState';
import TeamViewsSurface from './TeamViewsSurface';
import {
  ALL_TEAM_CYCLES,
  type TeamIssueScope,
  teamTaskQuery,
  teamTriageQuery,
} from './teamWorkQuery';
import TeamTriageSurface from './triage/TeamTriageSurface';

const ISSUE_SCOPES: TeamIssueScope[] = ['all', 'active', 'backlog'];

// Board mode bounds the collection body to the scrollport so the kanban's own
// column scrollers engage; list mode lets the body grow and the scroll host
// stays the single scroll owner.
const boardBodyStyle = {
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
} as const;

const resolveIssueScope = (value: string | null): TeamIssueScope =>
  ISSUE_SCOPES.includes(value as TeamIssueScope) ? (value as TeamIssueScope) : 'all';

const TeamPage = memo(() => {
  const { t } = useTranslation('common');
  const { teamId } = useParams<{ teamId: string }>();
  const workspaceId = useActiveWorkspaceId();
  const workspaceSlug = useActiveWorkspaceSlug();
  const [searchParams, setSearchParams] = useSearchParams();
  // Linear's per-team sub-navigation lands here: home is the team context
  // surface; triage, issues, projects and views each get their own tab.
  const teamTab = searchParams.get('tab') ?? 'home';
  const issueScope = resolveIssueScope(searchParams.get('scope'));
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
  // Triage is a per-team capability — a team that turned intake off shows
  // no triage surface, and a `?tab=triage` deep link falls back to home.
  const triageCapable = teamData?.data.team.orchestrationPolicy?.triageEnabled !== false;
  const wantsTriage = triageCapable && teamTab === 'triage';
  const wantsTasks = teamTab === 'issues';
  // Board mode escapes the centered column — same WorkSurface frame as My issues.
  const boardActive = wantsTasks && layout === 'board';
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
      ? ['team-tasks', workspaceId, teamId, cycleId, noProject, layout, issueScope, triageCapable]
      : null,
    () =>
      workAttentionService.query({
        query: teamTaskQuery(teamId!, cycleId, noProject, layout, issueScope, triageCapable),
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
  // Team context shows the team's own views plus every workspace-shared view
  // the visitor can read — Linear keeps both reachable from the team page.
  const teamViews = (teamViewsData?.data ?? []).filter(
    (view) =>
      (view.visibility === 'team' && view.teamId === teamId) || view.visibility === 'workspace',
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
  }, [cycleId, issueScope, layout, noProject, teamId, teamQueryHash, workspaceId]);
  const teamTasks = mergeWorkQueryPage(firstTeamTasks, teamTail);
  const teamGroups = mergeWorkQueryGroups(firstTeamGroups, teamGroupTail);
  const tasks = triageData?.data && 'tasks' in triageData.data ? triageData.data.tasks : [];
  const destinations = otherTeamOptions(teamsData?.data ?? [], teamId ?? '');
  const workState = teamSurfaceState({
    error: teamTasksError,
    isLoading: isTeamTasksLoading,
    itemCount: teamTasks.length + teamGroups.reduce((sum, group) => sum + group.tasks.length, 0),
  });

  const refreshTriage = useCallback(() => {
    setTeamTail([]);
    setTeamGroupTail([]);
    void Promise.all([
      mutate(['team-triage', workspaceId, teamId, cycleId, noProject]),
      mutate([
        'team-tasks',
        workspaceId,
        teamId,
        cycleId,
        noProject,
        layout,
        issueScope,
        triageCapable,
      ]),
    ]);
  }, [cycleId, issueScope, layout, noProject, teamId, triageCapable, workspaceId]);

  const loadMoreTeam = useCallback(async () => {
    const last = teamTasks.at(-1);
    if (!last || !teamId || !teamQueryHash) return;
    const next = await workAttentionService.query({
      afterId: last.id,
      query: teamTaskQuery(teamId, cycleId, noProject, 'list', issueScope, triageCapable),
      queryHash: teamQueryHash,
    });
    const incoming = next.data && 'tasks' in next.data ? next.data.tasks : [];
    setTeamTail((current) => mergeWorkQueryPage(current, incoming));
  }, [cycleId, issueScope, noProject, teamId, teamQueryHash, teamTasks, triageCapable]);

  const loadMoreTeamGroup = useCallback(
    async (groupKey: string) => {
      const column = teamGroups.find((group) => group.key === groupKey);
      const last = column?.tasks.at(-1);
      if (!last || !teamId || !teamQueryHash) return;
      const next = await workAttentionService.query({
        afterId: last.id,
        groupKey,
        query: teamTaskQuery(teamId, cycleId, noProject, layout, issueScope, triageCapable),
        queryHash: teamQueryHash,
      });
      const incoming = next.data && 'groups' in next.data ? (next.data.groups ?? []) : [];
      setTeamGroupTail((current) => mergeWorkQueryGroups(current, incoming));
    },
    [cycleId, issueScope, layout, noProject, teamGroups, teamId, teamQueryHash, triageCapable],
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

  // The views tab is a routed surface of its own — a team-scoped directory
  // plus the `?new=1` draft editor — so it returns before the shared team
  // chrome. The team fetch still gates it: the editor header and save-to
  // copy need the real team name, and a failed team response must never
  // leave the tab blank.
  if (teamTab === 'views' && teamId) {
    if (!workspaceId)
      return (
        <WorkSurface>
          <NavHeader
            left={
              <Text style={{ paddingInlineStart: 4 }} weight={500}>
                {t('tab.views')}
              </Text>
            }
          />
          <Center flex={1}>
            <Empty description={t('teams.personal')} icon={UsersIcon} />
          </Center>
        </WorkSurface>
      );
    if (teamError || !teamData)
      return (
        <WorkSurface>
          <NavHeader
            left={
              <Text style={{ paddingInlineStart: 4 }} weight={500}>
                {t('tab.views')}
              </Text>
            }
          />
          <WorkSurfaceCollection>
            {teamError ? (
              <AsyncError error={teamError} onRetry={() => revalidateTeam()} />
            ) : (
              <SkeletonList aria-label={t('teams.loading')} rows={4} />
            )}
          </WorkSurfaceCollection>
        </WorkSurface>
      );
    return (
      <TeamViewsSurface
        error={teamViewsError}
        isLoading={isTeamViewsLoading}
        teamId={teamId}
        teamName={teamData.data.team.name}
        views={teamViews}
        onRetry={() => revalidateTeamViews()}
      />
    );
  }

  if (teamTab === 'projects' && teamId) return <TeamProjectsSurface teamId={teamId} />;

  return (
    <WorkSurface>
      <NavHeader
        left={
          wantsTriage && teamData ? (
            <Flexbox horizontal align={'center'} gap={8} style={{ paddingInlineStart: 4 }}>
              <TeamIdentity
                color={teamData.data.team.color}
                id={teamData.data.team.id}
                letter={(teamData.data.team.key || teamData.data.team.name).slice(0, 1)}
              />
              <Text weight={500}>{t('teams.triage')}</Text>
            </Flexbox>
          ) : (
            <Text style={{ paddingInlineStart: 4 }} weight={500}>
              {teamData?.data.team.name ?? t('tab.teams')}
            </Text>
          )
        }
        right={
          <Flexbox horizontal align={'center'} gap={8}>
            <WorkFavoriteButton targetId={teamId} targetType="team" />
          </Flexbox>
        }
      />
      {!workspaceId ? (
        <Center flex={1}>
          <Empty description={t('teams.personal')} icon={UsersIcon} />
        </Center>
      ) : (
        <WorkSurfaceCollection
          style={boardActive ? boardBodyStyle : undefined}
          toolbar={
            /* Issues toolbar: the All–Active–Backlog scope stays primary;
               cycle / no-project filters and the list/board switch ride the
               aside so they overflow into the popover instead of wrapping.
               Triage never shows the layout toggle — it renders its own row
               surface. */
            teamTab === 'issues' && !teamError ? (
              <WorkSurfaceToolbar
                asideLabel={t('members.filter')}
                aside={
                  <>
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
                    <Segmented
                      size="small"
                      value={layout}
                      options={[
                        { label: t('teams.layoutList'), value: 'list' },
                        { label: t('teams.layoutBoard'), value: 'board' },
                      ]}
                      onChange={(value) => setLayout(value as WorkQueryLayout)}
                    />
                  </>
                }
              >
                <Segmented
                  size="small"
                  value={issueScope}
                  options={ISSUE_SCOPES.map((scope) => ({
                    label: t(`teams.scope.${scope}`),
                    value: scope,
                  }))}
                  onChange={(value) =>
                    setSearchParams(
                      ...nextTeamIssueScopeNavigation(searchParams, value as TeamIssueScope),
                    )
                  }
                />
              </WorkSurfaceToolbar>
            ) : undefined
          }
        >
          {/* The team fetch gates every tab — a failed team response never
              renders a half-populated tab surface underneath the error. */}
          {teamError ? (
            <AsyncError error={teamError} onRetry={() => revalidateTeam()} />
          ) : (
            <>
              {teamTab === 'home' && teamData ? (
                <TeamHome
                  teamData={teamData.data}
                  teamId={teamId!}
                  triageCapable={triageCapable}
                  workspaceSlug={workspaceSlug ?? ''}
                />
              ) : null}
              {teamTab === 'triage' && !triageCapable ? (
                <Center flex={1} padding={48}>
                  <Empty description={t('teams.triageDisabled')} icon={ListChecksIcon} />
                </Center>
              ) : null}
              {wantsTriage && teamId ? (
                <TeamTriageSurface
                  destinations={destinations}
                  error={triageError}
                  isLoading={isLoading}
                  members={teamData?.data.members ?? []}
                  tasks={tasks}
                  teamId={teamId}
                  onChanged={refreshTriage}
                  onRetry={() => void revalidateTriage()}
                />
              ) : null}

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
              {wantsTasks ? (
                workState === 'error' ? (
                  <AsyncError error={teamTasksError} onRetry={() => revalidateTeamTasks()} />
                ) : (
                  <WorkQueryResults
                    createContext={{ teamId }}
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
            </>
          )}
        </WorkSurfaceCollection>
      )}
    </WorkSurface>
  );
});

TeamPage.displayName = 'TeamPage';

export default TeamPage;
