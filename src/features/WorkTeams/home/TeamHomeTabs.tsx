'use client';

import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';

import { TEAM_HOME_SECTIONS, type TeamHomeSection, teamHomeSectionTo } from './teamHomeSection';

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

/** Routed team sections preserve unrelated query parameters. */
const TeamHomeTabs = memo<TeamHomeTabsProps>(({ active, searchParams, teamId }) => {
  const { t } = useTranslation('common');

  return (
    <Tabs value={active}>
      <TabsList activateOnFocus={false} aria-label={t('teams.subNav.home')}>
        {TEAM_HOME_SECTIONS.map((section) => (
          <TabsTrigger
            key={section}
            nativeButton={false}
            value={section}
            render={
              <WorkspaceLink
                aria-current={active === section ? 'page' : undefined}
                to={teamHomeSectionTo(teamId, searchParams, section)}
              />
            }
          >
            {t(sectionLabels[section])}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
});

TeamHomeTabs.displayName = 'TeamHomeTabs';

export default TeamHomeTabs;
