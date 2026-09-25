'use client';

import { Center, Empty, Flexbox, Icon } from '@lobehub/ui';
import { ActionIcon, type DropdownItem, DropdownMenu, Text, toast } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { EllipsisIcon, InboxIcon, Link2Icon, SettingsIcon, UsersIcon } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import AsyncError from '@/components/AsyncError';
import WorkFavoriteButton from '@/features/HomeSidebar/Body/WorkFavoriteButton';
import {
  EMPTY_FILTER_BUILDER,
  myWorkActiveFilterCount,
  workQueryFilterHasPredicates,
} from '@/features/MyWork/myWorkFilters';
import NavHeader from '@/features/NavHeader';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import { SavedViewProjectRow } from '@/features/SavedViews/SavedViewPage';
import {
  type BuilderState,
  builderToFilter,
  stableStringify,
} from '@/features/SavedViews/workQueryBuilder';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { WorkSurface, WorkSurfaceCollection } from '@/features/WorkSurface';
import { useSearchParams } from '@/libs/router/navigation';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { lambdaClient } from '@/libs/trpc/client';
import { workAttentionService } from '@/services/workAttention';

import { otherTeamOptions } from './otherTeamOptions';
import TeamHome from './TeamHome';
import TeamIdentity from './TeamIdentity';
import TeamIssuesSurface from './TeamIssuesSurface';
import TeamProjectsSurface from './TeamProjectsSurface';
import TeamViewsSurface from './TeamViewsSurface';
import { ALL_TEAM_CYCLES, teamTriageQuery } from './teamWorkQuery';
import TeamTriageControls from './triage/TeamTriageControls';
import {
  patchTeamTriageParams,
  readTeamTriageUrlState,
  resetTeamTriageDisplayParams,
  teamTriageSort,
} from './triage/teamTriageDisplay';
import TeamTriageSurface from './triage/TeamTriageSurface';

const TeamPage = memo(() => {
  const { t } = useTranslation('common');
  const { teamId } = useParams<{ teamId: string }>();
  const workspaceId = useActiveWorkspaceId();
  const workspaceSlug = useActiveWorkspaceSlug();
  const [searchParams, setSearchParams] = useSearchParams();
  // Linear's per-team sub-navigation lands here: home is the team context
  // surface; triage, issues, projects and views each get their own tab.
  const teamTab = searchParams.get('tab') ?? 'home';
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

  /* --------------------- triage filter + display --------------------- */

  // Display options are URL-backed like the issues surface (reload and
  // Back/forward restore the exact view); the Add-filter builder stays
  // component-local — its durable form is a saved view, same contract as
  // My issues and team issues.
  const triageDisplay = readTeamTriageUrlState(searchParams);
  const [triageBuilder, setTriageBuilder] = useState<BuilderState>(EMPTY_FILTER_BUILDER);
  const triageBuilderFilter = builderToFilter('task', triageBuilder);
  const triageHasFilters = workQueryFilterHasPredicates(triageBuilderFilter);
  const triageActiveFilterCount = myWorkActiveFilterCount(triageBuilder);
  const triageSort = teamTriageSort(triageDisplay);
  const triageQuery = useMemo(
    () =>
      teamId
        ? teamTriageQuery(teamId, ALL_TEAM_CYCLES, false, {
            filter: triageHasFilters ? triageBuilderFilter : undefined,
            sort: triageSort,
          })
        : null,
    [teamId, triageBuilderFilter, triageHasFilters, triageSort],
  );
  const triageQueryKey = stableStringify(triageQuery);
  const {
    data: triageData,
    error: triageError,
    isLoading,
    mutate: revalidateTriage,
  } = useClientDataSWR(
    wantsTriage && teamId && workspaceId && triageQuery
      ? ['team-triage', workspaceId, teamId, triageQueryKey]
      : null,
    () => workAttentionService.query({ query: triageQuery! }),
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
  const tasks = triageData?.data && 'tasks' in triageData.data ? triageData.data.tasks : [];
  const destinations = otherTeamOptions(teamsData?.data ?? [], teamId ?? '');

  const refreshTriage = useCallback(() => {
    void Promise.all([
      // The triage key now carries the query hash — prefix-match it so a
      // mutation revalidates whichever filter/ordering is on screen.
      mutate(
        (key) =>
          Array.isArray(key) &&
          key[0] === 'team-triage' &&
          key[1] === workspaceId &&
          key[2] === teamId,
      ),
      // The issues surface owns its own query shape — prefix-match the key so
      // a triage accept/decline still revalidates whatever it is showing.
      mutate(
        (key) =>
          Array.isArray(key) &&
          key[0] === 'team-tasks' &&
          key[1] === workspaceId &&
          key[2] === teamId,
      ),
    ]);
  }, [teamId, workspaceId]);

  const navigate = useWorkspaceAwareNavigate();

  const copyTeamUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t('savedViews.linkCopied'));
    } catch {
      toast.error(t('savedViews.linkCopyFailed'));
    }
  }, [t]);

  const teamMenuItems = useMemo<DropdownItem[]>(
    () => [
      {
        icon: <Icon icon={SettingsIcon} />,
        key: 'settings',
        label: t('teams.navSettings'),
        onClick: () => navigate('/settings'),
      },
      {
        icon: <Icon icon={Link2Icon} />,
        key: 'copyUrl',
        label: t('teams.copyTeamUrl'),
        onClick: copyTeamUrl,
      },
    ],
    [copyTeamUrl, navigate, t],
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

  // The issues tab owns its full chrome — scope switch, filter/display/detail
  // controls, paging and the peek pane — in a dedicated surface.
  if (teamTab === 'issues' && teamId) return <TeamIssuesSurface teamId={teamId} />;

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
              <Text weight={500}>{teamData.data.team.name}</Text>
              <span aria-hidden style={{ color: cssVar.colorTextTertiary }}>
                ›
              </span>
              <Text weight={500}>{t('teams.triage')}</Text>
              {teamId && (
                <WorkFavoriteButton
                  icon="star"
                  targetId={teamId}
                  targetType="team"
                  variant="icon"
                />
              )}
            </Flexbox>
          ) : (
            <Flexbox horizontal align={'center'} gap={6} style={{ paddingInlineStart: 4 }}>
              {teamData ? (
                <TeamIdentity
                  color={teamData.data.team.color}
                  id={teamData.data.team.id}
                  letter={(teamData.data.team.key || teamData.data.team.name).slice(0, 1)}
                />
              ) : null}
              <Text weight={500}>{teamData?.data.team.name ?? t('tab.teams')}</Text>
              {teamId && (
                <>
                  <WorkFavoriteButton
                    icon="star"
                    targetId={teamId}
                    targetType="team"
                    variant="icon"
                  />
                  <DropdownMenu items={teamMenuItems} placement={'bottomRight'}>
                    <ActionIcon icon={EllipsisIcon} size={'small'} title={t('teams.actions')} />
                  </DropdownMenu>
                </>
              )}
            </Flexbox>
          )
        }
        right={
          <Flexbox horizontal align={'center'} gap={8}>
            {/* Linear keeps triage's Add filter / Display options in the
                header — additive opt-in, the other tabs' chrome is
                untouched. */}
            {wantsTriage ? (
              <TeamTriageControls
                activeFilterCount={triageActiveFilterCount}
                builder={triageBuilder}
                display={triageDisplay}
                onBuilderChange={setTriageBuilder}
                onResetFilters={() => setTriageBuilder(EMPTY_FILTER_BUILDER)}
                onDisplayChange={(patch) =>
                  setSearchParams(patchTeamTriageParams(searchParams, patch), { replace: true })
                }
                onResetDisplay={() =>
                  setSearchParams(resetTeamTriageDisplayParams(searchParams), { replace: true })
                }
              />
            ) : null}
            <ActionIcon
              aria-label={t('teams.copyTeamUrl')}
              icon={Link2Icon}
              size={'small'}
              title={t('teams.copyTeamUrl')}
              onClick={copyTeamUrl}
            />
          </Flexbox>
        }
      />
      {!workspaceId ? (
        <Center flex={1}>
          <Empty description={t('teams.personal')} icon={UsersIcon} />
        </Center>
      ) : (
        <WorkSurfaceCollection>
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
                  <Empty description={t('teams.triageDisabled')} icon={InboxIcon} />
                </Center>
              ) : null}
              {wantsTriage && teamId ? (
                <TeamTriageSurface
                  destinations={destinations}
                  error={triageError}
                  isLoading={isLoading}
                  members={teamData?.data.members ?? []}
                  showId={triageDisplay.showId}
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
                    <Empty description={t('teams.projectsEmpty')} icon={PROJECT_ENTITY_ICON} />
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
            </>
          )}
        </WorkSurfaceCollection>
      )}
    </WorkSurface>
  );
});

TeamPage.displayName = 'TeamPage';

export default TeamPage;
