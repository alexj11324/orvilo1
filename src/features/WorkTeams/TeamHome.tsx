'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import type { TeamItem, TeamMemberItem } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { ArrowRightIcon, FolderKanbanIcon, LayoutListIcon, ListChecksIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';

import type { WorkspaceMemberSummary } from '../Teammates/api/contract';
import { useWorkspaceMembersQuery } from '../Teammates/api/hooks';
import { type TeamHomeDestination, teamHomeDestinations } from './teamHomeDestinations';
import TeamIdentity from './TeamIdentity';

const styles = createStaticStyles(({ css }) => ({
  description: css`
    margin-block-start: 20px;
    padding-inline: 12px;

    font-size: 15px;
    font-weight: 450;
    line-height: 23px;
    white-space: pre-wrap;
  `,
  identity: css`
    padding-inline: 12px;
  `,
  main: css`
    min-width: 0;
    padding-block-start: 24px;

    @container work-surface (max-width: 1000px) {
      padding-block-start: 4px;
    }
  `,
  member: css`
    display: inline-flex;
    align-items: center;
    min-width: 0;
    height: 26px;
  `,
  memberGroup: css`
    display: flex;
    flex-direction: column;
    gap: 8px;

    @container work-surface (max-width: 1000px) {
      flex-direction: row;
      gap: 4px;
      align-items: center;
      padding-inline: 12px;
    }
  `,
  name: css`
    overflow: hidden;

    margin: 0;

    font-size: 24px;
    font-weight: 500;
    line-height: 32px;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  navGroup: css`
    display: flex;
    flex-direction: column;
    gap: 8px;

    @container work-surface (max-width: 1000px) {
      flex-flow: row wrap;
      gap: 0;
      align-items: center;
      padding-inline: 6px;
    }
  `,
  navLink: css`
    display: flex;
    gap: 8px;
    align-items: center;

    width: fit-content;
    min-height: 28px;
    padding-block: 5px;
    padding-inline: 6px;
    border-radius: ${cssVar.borderRadius};

    color: ${cssVar.colorText};
    text-decoration: none;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  rail: css`
    display: flex;
    flex-direction: column;
    gap: 12px;

    min-width: 0;
    padding-block-start: 40px;

    @container work-surface (max-width: 1000px) {
      flex-flow: row wrap;
      gap: 4px;
      align-items: center;
      padding-block-start: 16px;
    }
  `,
  root: css`
    display: grid;
    grid-template-columns: minmax(0, 712px) 212px;
    gap: 48px;

    width: min(972px, 100%);
    margin-block-start: 36px;
    margin-inline: auto;

    @container work-surface (max-width: 1000px) {
      display: flex;
      flex-direction: column;
      gap: 0;

      width: 100%;
      margin-block-start: 0;
    }
  `,
  sectionTitle: css`
    font-size: 14px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};

    @container work-surface (max-width: 1000px) {
      display: none;
    }
  `,
}));

interface TeamHomeProps {
  teamData: {
    members: TeamMemberItem[];
    team: TeamItem;
  };
  teamId: string;
  triageCapable: boolean;
  workspaceSlug: string;
}

const destinationIcons = {
  issues: ListChecksIcon,
  projects: FolderKanbanIcon,
  triage: ArrowRightIcon,
  views: LayoutListIcon,
} satisfies Record<TeamHomeDestination, typeof ListChecksIcon>;

const destinationLabels = {
  issues: 'teams.navIssues',
  projects: 'teams.navProjects',
  triage: 'teams.navTriage',
  views: 'teams.navViews',
} as const satisfies Record<TeamHomeDestination, string>;

const TeamHome = ({ teamData, teamId, triageCapable, workspaceSlug }: TeamHomeProps) => {
  const { t } = useTranslation('common');
  const { t: tProject } = useTranslation('project');
  const membersQuery = useWorkspaceMembersQuery({ enabled: true });
  const memberByUserId = new Map<string, WorkspaceMemberSummary>(
    (membersQuery.members ?? []).map((member) => [member.userId, member]),
  );
  const teamMembers = teamData.members
    .map((member) => memberByUserId.get(member.userId))
    .filter((member): member is WorkspaceMemberSummary => Boolean(member));
  const destinations = teamHomeDestinations(teamId, workspaceSlug, triageCapable);

  return (
    <div className={styles.root}>
      <div className={styles.main}>
        <Flexbox horizontal align="center" className={styles.identity} gap={12}>
          <TeamIdentity
            color={teamData.team.color}
            id={teamData.team.id}
            letter={(teamData.team.key || teamData.team.name).slice(0, 1)}
            size={36}
          />
          <h1 className={styles.name}>{teamData.team.name}</h1>
        </Flexbox>
        <Text className={styles.description} type="secondary">
          {teamData.team.description || tProject('overview.descriptionEmpty')}
        </Text>
      </div>

      <aside className={styles.rail}>
        <div className={styles.memberGroup}>
          <div className={styles.sectionTitle}>{t('teams.members')}</div>
          {membersQuery.isLoading ? (
            <SkeletonList aria-label={t('teams.loading')} rows={1} />
          ) : membersQuery.error ? (
            <AsyncError
              error={membersQuery.error}
              variant="inline"
              onRetry={() => void membersQuery.mutate()}
            />
          ) : teamMembers.length === 0 ? (
            <Text type="secondary">{t('teams.membersEmpty')}</Text>
          ) : (
            <Flexbox horizontal align="center" gap={4} wrap="wrap">
              {teamMembers.map((member) => {
                const name = member.user?.fullName || member.user?.username || member.user?.email;
                return (
                  <span className={styles.member} key={member.userId} title={name ?? undefined}>
                    <Avatar avatar={member.user?.avatar} name={name ?? undefined} size={26} />
                  </span>
                );
              })}
            </Flexbox>
          )}
        </div>

        <nav aria-label={t('teams.quickLinks')} className={styles.navGroup}>
          <div className={styles.sectionTitle}>{t('teams.quickLinks')}</div>
          {destinations.map(({ key, to }) => (
            <WorkspaceLink className={styles.navLink} key={key} to={to}>
              <Icon icon={destinationIcons[key]} size={16} />
              <Text fontSize={14}>{t(destinationLabels[key])}</Text>
            </WorkspaceLink>
          ))}
        </nav>
      </aside>
    </div>
  );
};

export default TeamHome;
