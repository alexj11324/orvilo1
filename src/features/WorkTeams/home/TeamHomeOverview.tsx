'use client';
import type { TeamItem } from '@orvilo/types';
import { cn } from 'cn';
import { InboxIcon, LayoutListIcon, ListChecksIcon } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';

import { type TeamHomeDestination, teamHomeDestinations } from '../teamHomeDestinations';
import TeamIdentity from '../TeamIdentity';
import type { TeamHomeMember } from './teamHomeMembersModel';
import nativeStyles from './TeamHomeOverview.module.css';
import TeamResources from './TeamResources';

const styles = {
  description: 'mbs-7 text-sm leading-5.5 font-normal whitespace-pre-wrap',
  identity: 'min-w-0',
  left: nativeStyles.left,
  main: nativeStyles.main,
  member: 'inline-flex items-center min-w-0 h-6.5',
  memberGroup: nativeStyles.memberGroup,
  name: 'm-0 overflow-hidden text-2xl leading-8 font-semibold text-ellipsis whitespace-nowrap',
  navGroup: nativeStyles.navGroup,
  navLink: nativeStyles.navLink,
  rail: nativeStyles.rail,
  rest: nativeStyles.rest,
  root: nativeStyles.root,
  railTitle: nativeStyles.railTitle,
  section: 'flex flex-col gap-3.5 mbs-8',
} as const;

// The rail destinations draw the same entity marks the sidebar's team
// sub-navigation uses — triage is the inbox tray, not a generic arrow.
const destinationIcons = {
  issues: ListChecksIcon,
  projects: PROJECT_ENTITY_ICON,
  triage: InboxIcon,
  views: LayoutListIcon,
} satisfies Record<TeamHomeDestination, typeof ListChecksIcon>;

const destinationLabels = {
  issues: 'teams.navIssues',
  projects: 'teams.navProjects',
  triage: 'teams.navTriage',
  views: 'teams.navViews',
} as const satisfies Record<TeamHomeDestination, string>;

interface TeamHomeOverviewProps {
  members: TeamHomeMember[];
  membersError: unknown;
  membersLoading: boolean;
  onMembersRetry: () => void;
  team: TeamItem;
  teamId: string;
  triageCapable: boolean;
  workspaceSlug: string;
}

/**
 * Linear's Overview: identity + description, the Team resources section,
 * and the Members / Go to rail. Team resources reads the team's persisted
 * sections and placements; the rail keeps the four real team destinations.
 */
const TeamHomeOverview = memo<TeamHomeOverviewProps>(
  ({
    members,
    membersError,
    membersLoading,
    team,
    teamId,
    triageCapable,
    workspaceSlug,
    onMembersRetry,
  }) => {
    const { t } = useTranslation('common');
    const { t: tProject } = useTranslation('project');
    const destinations = teamHomeDestinations(teamId, workspaceSlug, triageCapable);

    return (
      <div className={styles.root}>
        <div className={styles.left}>
          <div className={styles.main}>
            <div className={cn('flex flex-row items-center gap-3', styles.identity)}>
              <TeamIdentity
                color={team.color}
                id={team.id}
                letter={(team.key || team.name).slice(0, 1)}
                size={36}
              />
              <h1 className={styles.name}>{team.name}</h1>
            </div>
            <span className={cn('text-sm text-muted-foreground', styles.description)}>
              {team.description || tProject('overview.descriptionEmpty')}
            </span>
          </div>

          <div className={styles.rest}>
            <div className={styles.section}>
              <TeamResources teamId={teamId} />
            </div>
          </div>
        </div>

        <aside className={styles.rail}>
          <div className={styles.memberGroup}>
            <div className={styles.railTitle}>{t('teams.members')}</div>
            {membersLoading ? (
              <div
                aria-busy
                aria-label={t('teams.loading')}
                className="flex flex-row items-center gap-1"
              >
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton className="size-6.5 rounded-full" key={index} />
                ))}
              </div>
            ) : membersError ? (
              <AsyncError error={membersError} variant="inline" onRetry={onMembersRetry} />
            ) : members.length === 0 ? (
              <span className="text-sm leading-5.5 text-muted-foreground">
                {t('teams.membersEmpty')}
              </span>
            ) : (
              <div className="flex flex-row items-center gap-1 flex-wrap">
                {members.map((member) => (
                  <span className={styles.member} key={member.userId} title={member.name}>
                    <Avatar avatar={member.avatar} name={member.name} size={26} />
                  </span>
                ))}
              </div>
            )}
          </div>

          <nav aria-label={t('teams.quickLinks')} className={styles.navGroup}>
            <div className={styles.railTitle}>{t('teams.quickLinks')}</div>
            {destinations.map(({ key, to }) => (
              <WorkspaceLink className={styles.navLink} key={key} to={to}>
                {createElement(destinationIcons[key], {
                  'aria-hidden': true,
                  'className': 'size-4 shrink-0',
                })}
                <span className="text-sm leading-5.5">{t(destinationLabels[key])}</span>
              </WorkspaceLink>
            ))}
          </nav>
        </aside>
      </div>
    );
  },
);

TeamHomeOverview.displayName = 'TeamHomeOverview';

export default TeamHomeOverview;
