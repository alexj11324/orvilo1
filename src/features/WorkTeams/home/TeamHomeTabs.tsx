'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import WorkspaceLink from '@/features/Workspace/WorkspaceLink';

import { TEAM_HOME_SECTIONS, type TeamHomeSection, teamHomeSectionTo } from './teamHomeSection';

const styles = createStaticStyles(({ css }) => ({
  link: css`
    display: inline-flex;
    flex: none;
    align-items: center;

    height: 28px;
    padding-inline: 10px;
    border-radius: 9999px;

    font-size: 12px;
    font-weight: 500;
    line-height: normal;
    color: ${cssVar.colorTextSecondary};
    text-decoration: none;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }

    &[aria-current='page'] {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillSecondary};
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: 2px;
    }
  `,
  tabs: css`
    display: flex;
    gap: 8px;
    align-items: center;
    padding-inline: 8px;

    @container work-surface (max-width: 1000px) {
      padding-inline: 6px;
    }
  `,
}));

const sectionLabels = {
  documents: 'teams.homeTabs.documents',
  members: 'teams.homeTabs.members',
  overview: 'teams.homeTabs.overview',
} as const satisfies Record<TeamHomeSection, string>;

interface TeamHomeTabsProps {
  active: TeamHomeSection;
  /** Current search params — section links preserve unrelated state. */
  searchParams: URLSearchParams;
  teamId: string;
}

/** Linear's Overview / Documents / Members strip — pill links, one URL each,
 * same visual language as the project tabs row. */
const TeamHomeTabs = memo<TeamHomeTabsProps>(({ active, searchParams, teamId }) => {
  const { t } = useTranslation('common');

  return (
    <nav aria-label={t('teams.subNav.home')} className={styles.tabs}>
      {TEAM_HOME_SECTIONS.map((section) => (
        <WorkspaceLink
          aria-current={active === section ? 'page' : undefined}
          className={styles.link}
          key={section}
          to={teamHomeSectionTo(teamId, searchParams, section)}
        >
          {t(sectionLabels[section])}
        </WorkspaceLink>
      ))}
    </nav>
  );
});

TeamHomeTabs.displayName = 'TeamHomeTabs';

export default TeamHomeTabs;
