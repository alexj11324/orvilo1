'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import type { TeamItem } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { InboxIcon, LayoutListIcon, ListChecksIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';

import { type TeamHomeDestination, teamHomeDestinations } from '../teamHomeDestinations';
import TeamIdentity from '../TeamIdentity';
import type { TeamHomeMember } from './teamHomeMembersModel';

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
    grid-area: main;
    min-width: 0;
    padding-block-start: 20px;

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
    gap: 4px;

    @container work-surface (max-width: 1000px) {
      flex-flow: row wrap;
      gap: 0;
      align-items: center;
      padding-inline: 6px;
    }
  `,
  navLink: css`
    display: flex;
    gap: 4px;
    align-items: center;

    width: fit-content;
    min-height: 32px;
    padding-block: 0;
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
    grid-area: rail;
    flex-direction: column;
    gap: 12px;

    min-width: 0;
    padding-block-start: 36px;

    @container work-surface (max-width: 1000px) {
      flex-flow: row wrap;
      gap: 4px;
      align-items: center;
      padding-block-start: 16px;
    }
  `,
  rest: css`
    grid-area: rest;
    min-width: 0;
  `,
  resourcesCopy: css`
    padding-inline: 12px;
    font-size: 13px;
    line-height: 20px;
    color: ${cssVar.colorTextTertiary};
  `,
  root: css`
    display: grid;
    grid-template-areas:
      'main rail'
      'rest rail';
    grid-template-columns: minmax(0, 712px) 212px;
    column-gap: 48px;

    width: 100%;

    /* Narrow reflow mirrors Linear: the member / Go-to rail slides inline
       between the description and Team resources — the DOM order already
       produces it, no order hack needed. */
    @container work-surface (max-width: 1000px) {
      display: flex;
      flex-direction: column;
      gap: 0;
    }
  `,
  railTitle: css`
    padding-inline: 12px;
    font-size: 13px;
    font-weight: 500;
    color: ${cssVar.colorTextDescription};

    @container work-surface (max-width: 1000px) {
      display: none;
    }
  `,
  section: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-block-start: 28px;
  `,
  sectionTitle: css`
    padding-inline: 12px;
    font-size: 18px;
    font-weight: 500;
    color: ${cssVar.colorText};
  `,
}));

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
 * and the Members / Go to rail. Every block is
 * backed by a real source — resources stays an honest empty line until a team
 * documents/links domain exists, and the rail keeps the four real team
 * destinations (no channel integration or team-settings route exists yet).
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
        <div className={styles.main}>
          <Flexbox horizontal align="center" className={styles.identity} gap={12}>
            <TeamIdentity
              color={team.color}
              id={team.id}
              letter={(team.key || team.name).slice(0, 1)}
              size={36}
            />
            <h1 className={styles.name}>{team.name}</h1>
          </Flexbox>
          <Text className={styles.description} type="secondary">
            {team.description || tProject('overview.descriptionEmpty')}
          </Text>
        </div>

        <aside className={styles.rail}>
          <div className={styles.memberGroup}>
            <div className={styles.railTitle}>{t('teams.members')}</div>
            {membersLoading ? (
              <SkeletonList aria-label={t('teams.loading')} rows={1} />
            ) : membersError ? (
              <AsyncError error={membersError} variant="inline" onRetry={onMembersRetry} />
            ) : members.length === 0 ? (
              <Text type="secondary">{t('teams.membersEmpty')}</Text>
            ) : (
              <Flexbox horizontal align="center" gap={4} wrap="wrap">
                {members.map((member) => (
                  <span className={styles.member} key={member.userId} title={member.name}>
                    <Avatar avatar={member.avatar} name={member.name} size={26} />
                  </span>
                ))}
              </Flexbox>
            )}
          </div>

          <nav aria-label={t('teams.quickLinks')} className={styles.navGroup}>
            <div className={styles.railTitle}>{t('teams.quickLinks')}</div>
            {destinations.map(({ key, to }) => (
              <WorkspaceLink className={styles.navLink} key={key} to={to}>
                <Icon icon={destinationIcons[key]} size={16} />
                <Text fontSize={13} weight={500}>
                  {t(destinationLabels[key])}
                </Text>
              </WorkspaceLink>
            ))}
          </nav>
        </aside>

        <div className={styles.rest}>
          <section aria-label={t('teams.resources')} className={styles.section}>
            <div className={styles.sectionTitle}>{t('teams.resources')}</div>
            <Text className={styles.resourcesCopy} type="secondary">
              {t('teams.resourcesEmpty')}
            </Text>
          </section>
        </div>
      </div>
    );
  },
);

TeamHomeOverview.displayName = 'TeamHomeOverview';

export default TeamHomeOverview;
