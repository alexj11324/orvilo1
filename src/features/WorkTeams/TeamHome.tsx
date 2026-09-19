'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { Tag, Text } from '@lobehub/ui/base-ui';
import type { TeamCycleItem, TeamItem, TeamMemberItem } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  ArrowRightIcon,
  FolderKanbanIcon,
  LayoutListIcon,
  ListChecksIcon,
  RepeatIcon,
} from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useClientDataSWR } from '@/libs/swr';
import { workAttentionService } from '@/services/workAttention';

import type { WorkspaceMemberSummary } from '../Teammates/api/contract';
import { useWorkspaceMembersQuery } from '../Teammates/api/hooks';

const styles = createStaticStyles(({ css }) => ({
  card: css`
    padding-block: 12px;
    padding-inline: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};
  `,
  link: css`
    display: flex;
    flex: 1;
    gap: 8px;
    align-items: center;

    min-width: 0;

    color: inherit;
    text-decoration: none;
  `,
  memberChip: css`
    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 4px;
    padding-inline: 4px 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 999px;
  `,
  navRow: css`
    display: flex;
    gap: 10px;
    align-items: center;

    padding-block: 9px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadiusLG};

    color: inherit;
    text-decoration: none;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  sectionTitle: css`
    font-size: 12px;
    font-weight: 600;
    color: ${cssVar.colorTextTertiary};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  `,
}));

interface TeamHomeProps {
  teamData: {
    cycles: TeamCycleItem[];
    members: TeamMemberItem[];
    team: TeamItem;
  };
  teamId: string;
  triageCapable: boolean;
  workspaceSlug: string;
}

/**
 * Team Home — the team's context surface: what the team is, who's on it, and
 * the real entry points into its work surfaces. It deliberately does not
 * embed the task list; Issues/Triage are their own tabs.
 */
const TeamHome = memo<TeamHomeProps>(({ teamData, teamId, triageCapable, workspaceSlug }) => {
  const { t } = useTranslation('common');
  const membersQuery = useWorkspaceMembersQuery({ enabled: true });

  const { data: teamProjectsData } = useClientDataSWR(['team-home-projects', teamId], () =>
    workAttentionService.query({
      limit: 6,
      query: {
        entityType: 'project',
        filter: { all: [{ field: 'teamId', op: 'eq', value: teamId }] },
        schemaVersion: 1,
      },
    }),
  );
  const { data: viewsData } = useClientDataSWR(['team-home-views', teamId], () =>
    workAttentionService.savedViewList(),
  );

  const memberByUserId = useMemo(() => {
    const map = new Map<string, WorkspaceMemberSummary>();
    for (const member of membersQuery.members ?? []) map.set(member.userId, member);
    return map;
  }, [membersQuery.members]);

  const teamMembers = useMemo(
    () =>
      teamData.members
        .map((member) => ({
          profile: memberByUserId.get(member.userId),
          role: member.role,
          userId: member.userId,
        }))
        .filter((row) => row.profile),
    [memberByUserId, teamData.members],
  );

  const teamProjects =
    teamProjectsData?.data && 'projects' in teamProjectsData.data
      ? (teamProjectsData.data.projects ?? [])
      : [];
  const teamViews = (viewsData?.data ?? []).filter(
    (view) => view.visibility === 'team' && view.teamId === teamId,
  );

  const now = Date.now();
  const activeCycles = teamData.cycles.filter((cycle) =>
    cycle.startsAt && cycle.endsAt && new Date(cycle.startsAt).getTime() <= now
      ? new Date(cycle.endsAt).getTime() >= now
      : false,
  );

  const teamPath = (tab: string) =>
    buildWorkspaceAwarePath(`/teams/${teamId}?tab=${tab}`, workspaceSlug);

  const navEntries = [
    { icon: ListChecksIcon, label: t('teams.navIssues'), to: teamPath('issues') },
    ...(triageCapable
      ? [{ icon: ArrowRightIcon, label: t('teams.navTriage'), to: teamPath('triage') }]
      : []),
    { icon: FolderKanbanIcon, label: t('teams.navProjects'), to: teamPath('projects') },
    { icon: LayoutListIcon, label: t('teams.navViews'), to: teamPath('views') },
  ];

  return (
    <Flexbox gap={20}>
      {teamData.team.description ? (
        <Text style={{ whiteSpace: 'pre-wrap' }} type="secondary">
          {teamData.team.description}
        </Text>
      ) : null}

      <div className={styles.card}>
        <div className={styles.sectionTitle}>{t('teams.members')}</div>
        <Flexbox gap={8} paddingBlock={8} wrap="wrap">
          {membersQuery.isLoading ? (
            <SkeletonList aria-label={t('teams.loading')} rows={1} />
          ) : teamMembers.length === 0 ? (
            <Text type="secondary">{t('teams.membersEmpty')}</Text>
          ) : (
            teamMembers.map(({ profile, role, userId }) => (
              <WorkspaceLink
                className={styles.memberChip}
                key={userId}
                to={buildWorkspaceAwarePath('/members', workspaceSlug)}
              >
                <Avatar
                  avatar={profile!.user?.avatar}
                  name={profile!.user?.fullName ?? profile!.user?.username ?? undefined}
                  size={20}
                />
                <Text ellipsis fontSize={13}>
                  {profile!.user?.fullName || profile!.user?.username || profile!.user?.email}
                </Text>
                {role === 'lead' ? <Tag color="gold">{t('teams.roleLead')}</Tag> : null}
              </WorkspaceLink>
            ))
          )}
        </Flexbox>
      </div>

      <Flexbox gap={4}>
        <div className={styles.sectionTitle}>{t('teams.quickLinks')}</div>
        {navEntries.map((entry) => (
          <WorkspaceLink className={styles.navRow} key={entry.to} to={entry.to}>
            <Icon icon={entry.icon} size={16} />
            <Text style={{ flex: 1 }}>{entry.label}</Text>
            <Icon icon={ArrowRightIcon} size={14} style={{ color: cssVar.colorTextTertiary }} />
          </WorkspaceLink>
        ))}
      </Flexbox>

      {activeCycles.length > 0 ? (
        <Flexbox gap={4}>
          <div className={styles.sectionTitle}>{t('teams.activeCycle')}</div>
          {activeCycles.map((cycle) => (
            <Flexbox horizontal align="center" gap={8} key={cycle.id} paddingBlock={4}>
              <Icon icon={RepeatIcon} size={14} />
              <Text weight={500}>{cycle.name || `#${cycle.number ?? cycle.id.slice(0, 8)}`}</Text>
              <Text fontSize={12} type="secondary">
                {new Date(cycle.startsAt!).toLocaleDateString()} –{' '}
                {new Date(cycle.endsAt!).toLocaleDateString()}
              </Text>
            </Flexbox>
          ))}
        </Flexbox>
      ) : null}

      {teamProjects.length > 0 ? (
        <Flexbox gap={4}>
          <div className={styles.sectionTitle}>{t('teams.navProjects')}</div>
          {teamProjects.slice(0, 5).map((project) => (
            <WorkspaceLink
              className={styles.navRow}
              key={project.id}
              to={buildWorkspaceAwarePath(`/project/${project.id}`, workspaceSlug)}
            >
              <Icon icon={FolderKanbanIcon} size={16} />
              <Text ellipsis style={{ flex: 1 }}>
                {project.name}
              </Text>
            </WorkspaceLink>
          ))}
        </Flexbox>
      ) : null}

      {teamViews.length > 0 ? (
        <Flexbox gap={4}>
          <div className={styles.sectionTitle}>{t('teams.navViews')}</div>
          {teamViews.slice(0, 5).map((view) => (
            <WorkspaceLink
              className={styles.navRow}
              key={view.id}
              to={buildWorkspaceAwarePath(`/views/${view.id}`, workspaceSlug)}
            >
              <Icon icon={LayoutListIcon} size={16} />
              <Text ellipsis style={{ flex: 1 }}>
                {view.name}
              </Text>
            </WorkspaceLink>
          ))}
        </Flexbox>
      ) : null}
    </Flexbox>
  );
});

TeamHome.displayName = 'TeamHome';

export default TeamHome;
